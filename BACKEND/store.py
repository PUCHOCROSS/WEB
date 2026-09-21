"""저장소: 설정 / 작업 기록 / 수집 결과 / 예약 (모두 data/ 폴더의 JSON 파일)

- 경로는 실행 위치(cwd)가 아니라 이 스크립트가 있는 폴더 기준입니다.
- 쓰기는 임시 파일에 먼저 쓴 뒤 교체(atomic)하므로, 도중에 종료돼도 파일이 깨지지 않습니다.
- UI(메인 스레드)에서만 호출하세요.
"""
import json
import os
import time
import uuid
from datetime import datetime, timedelta

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(APP_DIR, "data")
RESULT_DIR = os.path.join(DATA_DIR, "results")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")
HISTORY_FILE = os.path.join(DATA_DIR, "history.json")
SCHEDULE_FILE = os.path.join(DATA_DIR, "schedules.json")

MAX_HISTORY = 200


def _read(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _write(path, obj):
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
        os.replace(tmp, path)
    except Exception as e:
        print("저장 실패:", path, e)


def valid_hhmm(text):
    try:
        h, m = text.strip().split(":")
        return 0 <= int(h) <= 23 and 0 <= int(m) <= 59
    except Exception:
        return False


def next_occurrence(hhmm, now=None):
    """다음 HH:MM 시각의 timestamp (이미 지났으면 내일)"""
    now_dt = datetime.fromtimestamp(now) if now else datetime.now()
    h, m = (int(x) for x in hhmm.strip().split(":"))
    dt = now_dt.replace(hour=h, minute=m, second=0, microsecond=0)
    if dt <= now_dt:
        dt += timedelta(days=1)
    return dt.timestamp()


class Store:

    def __init__(self):
        os.makedirs(RESULT_DIR, exist_ok=True)
        self.settings = _read(SETTINGS_FILE, {})
        self.history = _read(HISTORY_FILE, [])
        self.schedules = _read(SCHEDULE_FILE, [])
        self.expire_stale_schedules()

    # ── 설정 ────────────────────────────────────────────────────────────
    def get(self, key, default=None):
        return self.settings.get(key, default)

    def set(self, key, value):
        if self.settings.get(key) != value:
            self.settings[key] = value
            _write(SETTINGS_FILE, self.settings)

    def update(self, **kw):
        changed = False
        for k, v in kw.items():
            if self.settings.get(k) != v:
                self.settings[k] = v
                changed = True
        if changed:
            _write(SETTINGS_FILE, self.settings)

    # ── 작업 기록 ───────────────────────────────────────────────────────
    def add_history(self, platform, query, pages, state, rows, duration):
        """rows: [(no, title, source, link, date), ...]"""
        rec = {
            "id": uuid.uuid4().hex[:12],
            "platform": platform,
            "query": query,
            "pages": pages,
            "state": state,
            "count": len(rows),
            "duration": int(duration),
            "ts": time.time(),
            "started": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        _write(os.path.join(RESULT_DIR, rec["id"] + ".json"), [list(r) for r in rows])
        self.history.insert(0, rec)
        for old in self.history[MAX_HISTORY:]:
            self._remove_result_file(old["id"])
        self.history = self.history[:MAX_HISTORY]
        _write(HISTORY_FILE, self.history)
        return rec

    def mark_published(self, rec_id, result):
        """홈페이지 발행 결과를 작업 기록에 표시"""
        for h in self.history:
            if h["id"] == rec_id:
                h["published"] = {
                    "at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "inserted": int(result.get("inserted", 0)),
                    "duplicates": int(result.get("duplicates", 0)),
                }
                _write(HISTORY_FILE, self.history)
                return

    def load_rows(self, rec_id):
        return [tuple(r) for r in _read(os.path.join(RESULT_DIR, rec_id + ".json"), [])]

    def delete_history(self, rec_ids):
        ids = set(rec_ids)
        for i in ids:
            self._remove_result_file(i)
        self.history = [h for h in self.history if h["id"] not in ids]
        _write(HISTORY_FILE, self.history)

    def clear_history(self):
        self.delete_history([h["id"] for h in self.history])

    @staticmethod
    def _remove_result_file(rec_id):
        try:
            os.remove(os.path.join(RESULT_DIR, rec_id + ".json"))
        except OSError:
            pass

    def last_for(self, platform):
        for h in self.history:
            if h["platform"] == platform:
                return h
        return None

    def recent_queries(self, platform, limit=8):
        seen, out = set(), []
        for h in self.history:
            if h["platform"] == platform and h["query"] not in seen:
                seen.add(h["query"])
                out.append(h["query"])
                if len(out) >= limit:
                    break
        return out

    def summary(self):
        """대시보드 상단 통계"""
        today = time.strftime("%Y-%m-%d")
        return {
            "today_jobs": sum(1 for h in self.history
                              if h["started"].startswith(today) and h["state"] == "done"),
            "total_rows": sum(h["count"] for h in self.history),
            "scheduled": len(self.schedules),
        }

    # ── 예약 ────────────────────────────────────────────────────────────
    def add_schedule(self, platform, query, pages, hhmm, repeat):
        rec = {
            "id": uuid.uuid4().hex[:8], "platform": platform, "query": query,
            "pages": pages, "time": hhmm, "repeat": repeat,  # once / daily
            "next_ts": next_occurrence(hhmm),
        }
        self.schedules.append(rec)
        _write(SCHEDULE_FILE, self.schedules)
        return rec

    def remove_schedule(self, sched_id):
        self.schedules = [s for s in self.schedules if s["id"] != sched_id]
        _write(SCHEDULE_FILE, self.schedules)

    def schedules_for(self, platform):
        return [s for s in self.schedules if s["platform"] == platform]

    def expire_stale_schedules(self, grace=3600):
        """앱이 꺼져 있던 동안 지나간 예약: 1회성은 삭제, 매일 반복은 다음 시각으로 넘김"""
        now, changed = time.time(), False
        keep = []
        for s in self.schedules:
            if s["next_ts"] < now - grace:
                changed = True
                if s["repeat"] == "daily":
                    s["next_ts"] = next_occurrence(s["time"], now)
                    keep.append(s)
            else:
                keep.append(s)
        self.schedules = keep
        if changed:
            _write(SCHEDULE_FILE, self.schedules)

    def due_schedules(self):
        now = time.time()
        return [s for s in self.schedules if s["next_ts"] <= now]

    def mark_ran(self, sched_id):
        for s in list(self.schedules):
            if s["id"] == sched_id:
                if s["repeat"] == "daily":
                    s["next_ts"] = next_occurrence(s["time"])
                else:
                    self.schedules.remove(s)
        _write(SCHEDULE_FILE, self.schedules)


STORE = Store()