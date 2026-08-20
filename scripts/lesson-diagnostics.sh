#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${LESSON_DIAGNOSTICS_OUTPUT_DIR:-${ROOT_DIR}/diagnostics-output}"
COLLECTOR="${ROOT_DIR}/scripts/collect-lesson-diagnostics.mjs"
PID_FILE="${OUTPUT_DIR}/collector.pid"
CONSOLE_LOG="${OUTPUT_DIR}/collector-console.log"

mkdir -p -- "${OUTPUT_DIR}"

latest_report() {
  local latest=""
  local candidate
  shopt -s nullglob
  for candidate in "${OUTPUT_DIR}"/lesson-diagnostics-*.json.gz; do
    if [[ -z "${latest}" || "${candidate}" -nt "${latest}" ]]; then
      latest="${candidate}"
    fi
  done
  shopt -u nullglob
  printf '%s' "${latest}"
}

read_live_pid() {
  local pid=""
  local command_line=""
  if [[ -f "${PID_FILE}" ]]; then
    pid="$(tr -dc '0-9' < "${PID_FILE}")"
  fi
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null && [[ -r "/proc/${pid}/cmdline" ]]; then
    command_line="$(tr '\0' ' ' < "/proc/${pid}/cmdline")"
    if [[ "${command_line}" == *"${COLLECTOR}"* ]]; then
      printf '%s' "${pid}"
      return 0
    fi
  fi
  return 1
}

command="${1:-help}"

case "${command}" in
  start)
    duration_minutes="${2:-180}"
    if ! [[ "${duration_minutes}" =~ ^[0-9]+$ ]] || [[ "${duration_minutes}" -le 0 ]]; then
      echo "Duration must be a positive whole number of minutes." >&2
      exit 1
    fi
    if live_pid="$(read_live_pid)"; then
      echo "Diagnostics are already running (PID ${live_pid})."
      exit 0
    fi
    rm -f -- "${PID_FILE}"
    nohup node "${COLLECTOR}" \
      --duration-minutes "${duration_minutes}" \
      --output-dir "${OUTPUT_DIR}" \
      > "${CONSOLE_LOG}" 2>&1 < /dev/null &
    collector_pid=$!
    printf '%s\n' "${collector_pid}" > "${PID_FILE}"
    sleep 1
    if ! kill -0 "${collector_pid}" 2>/dev/null; then
      echo "Diagnostics failed to start. Log: ${CONSOLE_LOG}" >&2
      tail -n 20 -- "${CONSOLE_LOG}" >&2 || true
      exit 1
    fi
    echo "Diagnostics started (PID ${collector_pid}) for up to ${duration_minutes} minutes."
    echo "You can close SSH. After the lesson run: npm run diagnostics:lesson -- stop"
    ;;

  stop)
    if live_pid="$(read_live_pid)"; then
      echo "Stopping diagnostics (PID ${live_pid}) and creating the archive..."
      kill -TERM "${live_pid}"
      for _ in {1..60}; do
        if ! kill -0 "${live_pid}" 2>/dev/null; then
          break
        fi
        sleep 0.5
      done
      if kill -0 "${live_pid}" 2>/dev/null; then
        echo "The collector is still finishing. Wait a few seconds and run stop again." >&2
        exit 1
      fi
    else
      echo "The collector is not running; checking for a completed archive."
    fi
    rm -f -- "${PID_FILE}"
    report="$(latest_report)"
    if [[ -n "${report}" ]]; then
      echo "DIAGNOSTIC_FILE=${report}"
    else
      echo "No diagnostic archive was found. Log: ${CONSOLE_LOG}" >&2
      exit 1
    fi
    ;;

  status)
    if live_pid="$(read_live_pid)"; then
      echo "Diagnostics are running (PID ${live_pid})."
    else
      echo "Diagnostics are not running."
    fi
    report="$(latest_report)"
    if [[ -n "${report}" ]]; then
      echo "LATEST_DIAGNOSTIC_FILE=${report}"
    fi
    ;;

  latest)
    report="$(latest_report)"
    if [[ -z "${report}" ]]; then
      echo "No diagnostic archive was found in ${OUTPUT_DIR}." >&2
      exit 1
    fi
    echo "${report}"
    ;;

  help|--help|-h)
    echo "Usage:"
    echo "  npm run diagnostics:lesson -- start [minutes]"
    echo "  npm run diagnostics:lesson -- stop"
    echo "  npm run diagnostics:lesson -- status"
    echo "  npm run diagnostics:lesson -- latest"
    ;;

  *)
    echo "Unknown command: ${command}" >&2
    exit 1
    ;;
esac
