#!/usr/bin/env python3
"""
KAZI AGENT v3.0 — AI Desktop Agent
No API key required by the user. All AI calls go through the Kazi backend,
which holds the Gemini key, tracks token usage, and enforces plan limits.
"""

import os
import sys
import json
import time
import base64
import requests
from io  import BytesIO
from PIL import Image
import pyautogui
import mss

# ── Windows UTF-8 fix ─────────────────────────────────────────
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stdin.reconfigure(encoding='utf-8')
    except Exception:
        pass

# ── Config — injected by main.js via environment ──────────────
BACKEND_URL    = os.getenv('KAZI_BACKEND_URL', 'https://api.kaziagent.com').rstrip('/')
SESSION_TOKEN  = os.getenv('KAZI_SESSION_TOKEN', '')

if not SESSION_TOKEN:
    print('ERROR: Not signed in. Please sign in to use Kazi.', flush=True)
    sys.exit(1)

HEADERS = {
    'Authorization': f'Bearer {SESSION_TOKEN}',
    'Content-Type':  'application/json',
}

# ── PyAutoGUI safety ──────────────────────────────────────────
pyautogui.FAILSAFE = True
pyautogui.PAUSE    = 0.25
SCREEN_W, SCREEN_H = pyautogui.size()

# ── Conversation history ──────────────────────────────────────
conversation_history = []


# ─────────────────────────────────────────────────────────────
def capture_screen() -> Image.Image:
    with mss.mss() as sct:
        mon  = sct.monitors[1]
        shot = sct.grab(mon)
        return Image.frombytes('RGB', shot.size, shot.bgra, 'raw', 'BGRX')


def image_to_b64(img: Image.Image) -> str:
    buf = BytesIO()
    # Resize to max 1280px wide to keep payload small
    if img.width > 1280:
        ratio = 1280 / img.width
        img = img.resize((1280, int(img.height * ratio)), Image.LANCZOS)
    img.save(buf, format='PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode('utf-8')


def get_cursor() -> tuple:
    return pyautogui.position()


# ─────────────────────────────────────────────────────────────
def analyze_screen(command: str, screenshot: Image.Image, step_context: str = '') -> dict:
    """Send screenshot + command to backend; backend calls Gemini and deducts token."""
    cx, cy = get_cursor()
    try:
        resp = requests.post(
            f'{BACKEND_URL}/agent/analyze',
            headers=HEADERS,
            json={
                'command':       command,
                'screenshot_b64': image_to_b64(screenshot),
                'context':       step_context,
                'screen_w':      SCREEN_W,
                'screen_h':      SCREEN_H,
                'cursor_x':      cx,
                'cursor_y':      cy,
            },
            timeout=30
        )
        if resp.status_code == 402:
            data = resp.json()
            return {'action': 'error', 'message': f'Out of tokens (balance: {data.get("balance", 0)}). Top up at kaziagent.com'}
        if resp.status_code == 401:
            return {'action': 'error', 'message': 'Session expired. Please sign in again.'}
        resp.raise_for_status()
        data = resp.json()
        return data.get('action') and data or data.get('action_data', data)
    except requests.exceptions.ConnectionError:
        return {'action': 'error', 'message': 'Cannot reach Kazi server. Check your internet connection.'}
    except requests.exceptions.Timeout:
        return {'action': 'error', 'message': 'Server took too long to respond. Try again.'}
    except Exception as e:
        return {'action': 'error', 'message': f'Network error: {str(e)}'}


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
            sx = int(action_data.get('start_x', action_data.get('x1', 0)))
            sy = int(action_data.get('start_y', action_data.get('y1', 0)))
            ex = int(action_data.get('end_x',   action_data.get('x2', 0)))
            ey = int(action_data.get('end_y',   action_data.get('y2', 0)))
            pyautogui.moveTo(sx, sy)
            pyautogui.drag(ex - sx, ey - sy, duration=0.3)
            return f'Dragged ({sx},{sy})→({ex},{ey}): {desc}'

        elif action == 'wait':
            s = float(action_data.get('seconds', 1))
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


# ─────────────────────────────────────────────────────────────
def extract_command(raw: str) -> tuple:
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

    max_steps = 30
    step_hist = []

    for step in range(1, max_steps + 1):
        screenshot = capture_screen()

        parts = []
        if extra_context:
            parts.append(f'[Context:\n{extra_context}]')
        if step_hist:
            parts.append('Steps so far:\n' + '\n'.join(f'{i+1}. {s}' for i, s in enumerate(step_hist[-5:])))
            parts.append(f'Now on step {step} — continue or mark done if complete.')
        step_context = '\n'.join(parts)

        action_data = analyze_screen(command, screenshot, step_context)
        result      = execute_action(action_data)
        step_hist.append(result)

        if action_data.get('action') in ('done', 'error', 'ask'):
            conversation_history.append({'role': 'assistant', 'content': result})
            return result

        time.sleep(0.3)

    return '[ERROR] Task exceeded maximum steps. Try breaking it into smaller commands.'


# ─────────────────────────────────────────────────────────────
def main():
    # Verify session is valid before starting
    try:
        r = requests.get(f'{BACKEND_URL}/auth/me', headers=HEADERS, timeout=10)
        if r.status_code != 200:
            print('ERROR: Session invalid. Please sign in again.', flush=True)
            sys.exit(1)
        user = r.json().get('user', {})
        balance = user.get('tokens_balance', 0)
        print(f'Kazi Agent ready! Tokens: {balance}', flush=True)
    except requests.exceptions.ConnectionError:
        print('ERROR: Cannot connect to Kazi server. Check your internet.', flush=True)
        sys.exit(1)

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
