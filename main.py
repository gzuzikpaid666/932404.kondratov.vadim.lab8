"""Портфолио проектов: FastAPI + SQLite. Запуск: uvicorn main:app --reload"""
import datetime as dt
import sqlite3
from collections import Counter
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

BASE = Path(__file__).parent
DB_PATH = BASE / "portfolio.db"
SEED = [
    ("Трекер привычек", "Мобильное PWA с графиками серий и напоминаниями.", "JavaScript, PWA, Chart.js", "https://example.com/habits", "2026-09-14"),
    ("Бот расписания", "Telegram-бот, присылающий расписание пар группы.", "Python, aiogram, SQLite", "https://example.com/bot", "2026-05-02"),
    ("Магазин книг", "Каталог с корзиной и фильтрами, REST API на FastAPI.", "Python, FastAPI, HTML, CSS", "", "2026-03-21"),
    ("Лендинг кофейни", "Адаптивная вёрстка без фреймворков.", "HTML, CSS", "https://example.com/coffee", "2025-11-30"),
]


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.create_function("lower_u", 1, lambda s: (s or "").lower())
    return con


def init_db() -> None:
    with db() as con:
        con.executescript((BASE / "schema.sql").read_text(encoding="utf-8"))
        if con.execute("SELECT COUNT(*) FROM projects").fetchone()[0] == 0:
            con.executemany(
                "INSERT INTO projects(title, description, tech_stack, link, date) VALUES (?,?,?,?,?)", SEED
            )


class ProjectIn(BaseModel):
    title: str = Field(max_length=100)
    description: str = Field("", max_length=1000)
    tech_stack: str = Field("", max_length=200)
    link: str = Field("", max_length=300)
    date: dt.date

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Название не должно быть пустым")
        return v.strip()

    @field_validator("tech_stack")
    @classmethod
    def normalize_stack(cls, v: str) -> str:
        unique = {}  
        for tag in (t.strip() for t in v.split(",")):
            if tag:
                unique.setdefault(tag.lower(), tag)
        return ", ".join(unique.values())

    @field_validator("link")
    @classmethod
    def link_is_http(cls, v: str) -> str:
        v = v.strip()
        if v and not v.lower().startswith(("http://", "https://")):
            raise ValueError("Ссылка должна начинаться с http:// или https://")
        return v


app = FastAPI(title="Портфолио проектов")
init_db()


def row_or_404(con: sqlite3.Connection, pid: int) -> dict:
    row = con.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
    if row is None:
        raise HTTPException(404, "Проект не найден")
    return dict(row)


@app.get("/api/projects")
def list_projects(q: str = "", tags: str = "", sort: str = Query("date_desc", pattern="^date_(asc|desc)$")):
    where, args = [], []
    if q.strip():
        where.append("instr(lower_u(title), ?) > 0")
        args.append(q.strip().lower())
    for tag in (t.strip().lower() for t in tags.split(",")): 
        if tag:
            where.append("instr(',' || replace(lower_u(tech_stack), ', ', ',') || ',', ?) > 0")
            args.append(f",{tag},")
    direction = "ASC" if sort == "date_asc" else "DESC" 
    sql = "SELECT * FROM projects"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY date {direction}, id {direction}"
    with db() as con:
        return [dict(r) for r in con.execute(sql, args)]


@app.get("/api/tags")
def list_tags():
    with db() as con:
        stacks = [r["tech_stack"] for r in con.execute("SELECT tech_stack FROM projects")]
    names, counts = {}, Counter()
    for stack in stacks:
        for tag in filter(None, (t.strip() for t in stack.split(","))):
            names.setdefault(tag.lower(), tag)
            counts[tag.lower()] += 1
    return sorted(({"name": names[k], "count": n} for k, n in counts.items()), key=lambda t: (-t["count"], t["name"].lower()))


@app.get("/api/projects/{pid}")
def get_project(pid: int):
    with db() as con:
        return row_or_404(con, pid)


@app.post("/api/projects", status_code=201)
def create_project(p: ProjectIn):
    with db() as con:
        cur = con.execute(
            "INSERT INTO projects(title, description, tech_stack, link, date) VALUES (?,?,?,?,?)",
            (p.title, p.description, p.tech_stack, p.link, p.date.isoformat()),
        )
        return row_or_404(con, cur.lastrowid)


@app.put("/api/projects/{pid}")
def update_project(pid: int, p: ProjectIn):
    with db() as con:
        row_or_404(con, pid)
        con.execute(
            "UPDATE projects SET title=?, description=?, tech_stack=?, link=?, date=? WHERE id=?",
            (p.title, p.description, p.tech_stack, p.link, p.date.isoformat(), pid),
        )
        return row_or_404(con, pid)


@app.delete("/api/projects/{pid}", status_code=204)
def delete_project(pid: int):
    with db() as con:
        row_or_404(con, pid)
        con.execute("DELETE FROM projects WHERE id = ?", (pid,))
    return Response(status_code=204)


app.mount("/", StaticFiles(directory=BASE / "static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", port=8000, reload=True)