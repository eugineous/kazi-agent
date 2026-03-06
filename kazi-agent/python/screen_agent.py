#!/usr/bin/env python3
"""
KAZI AGENT v2.0 — AI Desktop Agent
Screen control + vision processing via Google Gemini 2.0 Flash
API key is passed securely via environment variable (set by main.js, encrypted at rest).
"""

import os
import sys
import json
import time
import base64
import re
import pyautogui
import mss
import mss.tools
from io  import BytesIO
from PIL import Image

# ── Windows UTF-8 fix ────────────────────────────────────────────────────────
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stdin.reconfigure(encoding='utf-8')
    except Exception:
        pass

# ── API key — injected by main.js via environment, NEVER hardcoded ───────────
import google.generativeai as genai

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '').strip()
if not GEMINI_API_KEY:
    print("ERROR: No Gemini API key provided. Add one in Settings.", flush=True)
    sys.exit(1)

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash')

# ── PyAutoGUI safety ─────────────────────────────────────────────────────────
pyautogui.FAILSAFE = True
pyautogui.PAUSE    = 0.25

SCREEN_W, SCREEN_H = pyautogui.size()

# ── Conversation history (in-process, enriched by context from main.js) ──────
conversation_history = []


# ─────────────────────────────────────────────────────────────────────────────
def capture_screen() -> Image.Image:
    with mss.mss() as sct:
        mon = sct.monitors[1]
        shot = sct.grab(mon)
        return Image.frombytes('RGB', shot.size, shot.bgra, 'raw', 'BGRX')


def image_to_b64(img: Image.Image) -> str:
    buf = BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode('utf-8')


def get_cursor() -> tuple:
    return pyautogui.position()


# ─────────────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are KAZI, an advanced AI desktop agent. You see the user's screen and control their computer to complete tasks.

SCREEN: {w}x{h}  |  Cursor: ({cx},{cy})
USER COMMAND: {cmd}
{ctx}

Respond with ONLY a JSON object — no markdown, no explanation.

Actions available:
  {{"action":"click",        "x":N, "y":N, "button":"left|right", "description":"…"}}
  {{"action":"double_click", "x":N, "y":N, "description":"…"}}
  {{"action":"right_click",  "x":N, "y":N, "description":"…"}}
  {{"action":"type",         "text":"…",   "description":"…"}}
  {{"action":"hotkey",       "keys":["ctrl","c"], "description":"…"}}
  {{"action":"key",          "key":"enter",  "description":"…"}}
  {{"action":"scroll",       "direction":"up|down", "amount":3, "x":N, "y":N, "description":"…"}}
  {{"action":"move",         "x":N, "y":N, "description":"…"}}
  {{"action":"drag",         "start_x":N,"start_y":N,"end_x":N,"end_y":N,"description":"…"}}
  {{"action":"wait",         "seconds":N, "description":"…"}}
  {{"action":"done",         "message":"…", "summary":"…"}}
  {{"action":"error",        "message":"…", "suggestion":"…"}}
  {{"action":"ask",          "question":"…"}}

Rules:
1. Be PRECISE with coordinates — click exact centres of buttons/links.
2. Break complex tasks into ONE action at a time.
3. After clicking a text field, use "type" to fill it.
4. Use "done" once the task is fully complete.
5. Use "ask" only when the instruction is genuinely ambiguous.
6. Never read, transmit, or expose sensitive user data from the screen.
"""


def analyze_screen(command: str, screenshot: Image.Image, step_context: str = '') -> dict:
    cx, cy = get_cursor()
    prompt = SYSTEM_PROMPT.format(
        w=SCREEN_W, h=SCREEN_H, cx=cx, cy=cy,
        cmd=command,
        ctx=f'\nPREVIOUS STEPS:\n{step_context}' if step_context else ''
    )
    try:
        response = model.generate_content([
            prompt,
            {'mime_type': 'image/png', 'data': image_to_b64(screenshot)}
        ])
        text = response.text.strip()
        # Strip markdown fences if present
        m = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
        if m:
            text = m.group(1).strip()
        return json.loads(text)
    except json.JSONDecodeError:
        return {'action': 'error', 'message': 'AI returned unparseable response', 'suggestion': 'Try rephrasing'}
    except Exception as e:
        return {'action': 'error', 'message': f'AI error: {str(e)}', 'suggestion': 'Check internet connection'}


def execute_action(action_data: dict) -> str:
    action = action_data.get('action', '')
    desc   = action_data.get('description', '')
    try:
        if action == 'click':
            x, y = int(action_data['x']), int(action_data['y'])
            pyautogui.click(x, y, button=action_data.get('button', 'left'))
            return f'Clicked ({x},{y}): {desc}'

        elif action == 'double_click':
            x, y = int(action_data['x']), int(action_data['y'])
            pyautogui.doubleClick(x, y)
            return f'Double-clicked ({x},{y}): {desc}'

        elif action == 'right_click':
            x, y = int(action_data['x']), int(action_data['y'])
            pyautogui.rightClick(x, y)
            return f'Right-clicked ({x},{y}): {desc}'

        elif action == 'type':
            text = action_data['text']
            try:
                import pyperclip
                pyperclip.copy(text)
                pyautogui.hotkey('ctrl', 'v')
            except Exception:
                pyautogui.write(text, interval=0.02)
            return f'Typed: {text[:60]}{"…" if len(text) > 60 else ""}'

        elif action == 'hotkey':
            keys = action_data['keys']
            pyautogui.hotkey(*keys)
            return f'Hotkey: {"+".join(keys)}'

        elif action == 'key':
            pyautogui.press(action_data['key'])
            return f'Key: {action_data["key"]}'

        elif action == 'scroll':
            direction = action_data.get('direction', 'down')
            amount    = int(action_data.get('amount', 3))
            x = action_data.get('x')
            y = action_data.get('y')
            if x and y:
                pyautogui.moveTo(int(x), int(y))
            pyautogui.scroll(amount if direction == 'up' else -amount)
            return f'Scrolled {direction}: {desc}'

        elif action == 'move':
            x, y = int(action_data['x']), int(action_data['y'])
            pyautogui.moveTo(x, y, duration=0.15)
            return f'Moved to ({x},{y}): {desc}'

        elif action == 'drag':
            sx, sy = int(action_data['start_x']), int(action_data['start_y'])
            ex, ey = int(action_data['end_x']),   int(action_data['end_y'])
            pyautogui.moveTo(sx, sy)
            pyautogui.drag(ex - sx, ey - sy, duration=0.3)
            return f'Dragged ({sx},{sy})→({ex},{ey}): {desc}'

        elif action == 'wait':
            s = action_data.get('seconds', 1)
            time.sleep(s)
            return f'Waited {s}s: {desc}'

        elif action == 'done':
            summary = action_data.get('summary', action_data.get('message', 'Task complete'))
            return f'[DONE] {summary}'

        elif action == 'error':
            msg  = action_data.get('message', 'Unknown error')
            hint = action_data.get('suggestion', '')
            return f'[ERROR] {msg}' + (f' — {hint}' if hint else '')

        elif action == 'ask':
            return f'[QUESTION] {action_data.get("question", "What would you like me to do?")}'

        else:
            return f'Unknown action: {action}'

    except Exception as e:
        return f'[ERROR] Action failed: {str(e)}'


# ─────────────────────────────────────────────────────────────────────────────
def extract_command(raw: str) -> tuple[str, str]:
    """
    Separate context injected by main.js from the actual command.
    Format: [CONTEXT:\n...\n]\nCOMMAND: <actual command>
    Returns (actual_command, context_text)
    """
    if raw.startswith('[CONTEXT:'):
        idx = raw.find(']\nCOMMAND: ')
        if idx != -1:
            ctx = raw[len('[CONTEXT:'):idx].strip()
            cmd = raw[idx + len(']\nCOMMAND: '):].strip()
            return cmd, ctx
    return raw.strip(), ''


def process_command(raw_input: str) -> str:
    global conversation_history

    command, extra_context = extract_command(raw_input)
    conversation_history.append({'role': 'user', 'content': command})

    max_steps  = 30
    step_hist  = []

    for step in range(1, max_steps + 1):
        screenshot = capture_screen()

        # Build step context
        parts = []
        if extra_context:
            parts.append(f'[Memory context provided by UI:\n{extra_context}]')
        if step_hist:
            parts.append('Steps so far:\n' + '\n'.join(f'{i+1}. {s}' for i, s in enumerate(step_hist[-5:])))
            parts.append(f'Now on step {step} — continue or mark done if complete.')
        step_context = '\n'.join(parts)

        action_data = analyze_screen(command, screenshot, step_context)
        result      = execute_action(action_data)
        step_hist.append(result)

        terminal = action_data.get('action') in ('done', 'error', 'ask')
        if terminal:
            conversation_history.append({'role': 'assistant', 'content': result})
            return result

        time.sleep(0.3)

    return '[ERROR] Task exceeded maximum steps. Try breaking it into smaller commands.'


# ─────────────────────────────────────────────────────────────────────────────
def main():
    print('Kazi Agent ready!', flush=True)

    while True:
        try:
            line = input().strip()
            if not line:
                continue
            if line.lower() in ('exit', 'quit', 'bye'):
                break
            result = process_command(line)
            print(result, flush=True)

        except EOFError:
            break
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f'[ERROR] {str(e)}', flush=True)


if __name__ == '__main__':
    main()
