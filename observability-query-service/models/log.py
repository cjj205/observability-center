"""OTLP log response model."""

from .trace import TraceModel


class LogModel:
    def __init__(self):
        self.trace_model = TraceModel()

    def from_task(self, task, query):
        logs = self.filter_logs(task.get("logs") or [], query)
        limit = min(max(int(query.get("limit", 50)), 1), 200)
        items = [self.log_record(task, log) for log in logs[:limit]]
        return {
            "items": items,
            "nextCursor": None,
            "total": len(logs),
            "partial": False,
            "sourceStatus": {"log": {"status": "ready"}},
        }

    def filter_logs(self, logs, query):
        if query.get("category"):
            logs = [log for log in logs if log.get("category") == query["category"]]
        if query.get("severity"):
            logs = [log for log in logs if log.get("severity") == query["severity"]]
        if query.get("spanId"):
            logs = [log for log in logs if log.get("spanID") == query["spanId"]]
        if query.get("keyword"):
            keyword = query["keyword"].lower()
            logs = [log for log in logs if keyword in str(log.get("body", "")).lower()]
        if "fromOffsetMs" in query:
            logs = [log for log in logs if log.get("offsetMs", 0) >= query["fromOffsetMs"]]
        if "toOffsetMs" in query:
            logs = [log for log in logs if log.get("offsetMs", 0) <= query["toOffsetMs"]]
        return logs

    def log_record(self, task, log):
        timestamp = TraceModel.unix_nano(task["startedAt"], log.get("offsetMs", 0))
        severity = log.get("severity", "INFO")
        return {
            "timeUnixNano": timestamp,
            "observedTimestampUnixNano": timestamp,
            "severityText": severity,
            "severityNumber": self.severity_number(severity),
            "body": {"stringValue": log.get("body", "")},
            "attributes": TraceModel.attributes(log.get("attributes")),
            "traceId": (task.get("trace") or {}).get("traceID", ""),
            "spanId": log.get("spanID", ""),
        }

    @staticmethod
    def severity_number(severity):
        return 17 if severity == "ERROR" else 13 if severity == "WARN" else 9
