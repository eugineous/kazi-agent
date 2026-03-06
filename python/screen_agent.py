#!/usr/bin/env python3
"""
KAZI - AI Desktop Agent
Advanced screen control and vision processing (Vy-style)
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
from io import BytesIO
from PIL import Image
from dotenv import load_dotenv

# Fix Windows console encoding
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stdin.reconfigure(encoding='utf-8')
    except:
        pass

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

import google.generativeai as genai

# Configure Gemini
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    print("ERROR: GEMINI_API_KEY not found in .env file", flush=True)
    sys.exit(1)

genai.configure(api_key=GEMINI_API_KEY)

# Use Gemini 2.0 Flash for vision capabilities
model = genai.GenerativeModel('gemini-2.0-flash')

# Safety settings
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.3

# Get screen dimensions
SCREEN_WIDTH, SCREEN_HEIGHT = pyautogui.size()

# Conversation history for context
conversation_history = []

def capture_screen():
    """Capture the entire screen and return as PIL Image"""
    with mss.mss() as sct:
        monitor = sct.monitors[1]
        screenshot = sct.grab(monitor)
        img = Image.frombytes('RGB', screenshot.size, screenshot.bgra, 'raw', 'BGRX')
        return img

def image_to_base64(img):
    """Convert PIL Image to base64 string"""
    buffer = BytesIO()
    img.save(buffer, format='PNG', optimize=True)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

def get_cursor_position():
    """Get current mouse position"""
    return pyautogui.position()

def analyze_screen(command, screenshot, step_context=""):
    """Send screenshot to Gemini and get action plan - Vy style"""
    
    cursor_x, cursor_y = get_cursor_position()
    
    prompt = f"""You are KAZI, an advanced AI desktop agent similar to Vy by Vercept. You can see the user's screen and control their computer to complete tasks.

SCREEN INFO:
- Resolution: {SCREEN_WIDTH}x{SCREEN_HEIGHT}
- Current cursor position: ({cursor_x}, {cursor_y})

USER COMMAND: {command}

{step_context}

ANALYZE THE SCREENSHOT CAREFULLY AND RESPOND WITH A JSON ACTION.

Available actions:
1. click - Click at coordinates
   {{"action": "click", "x": 500, "y": 300, "button": "left", "description": "clicking X button"}}

2. double_click - Double click
   {{"action": "double_click", "x": 500, "y": 300, "description": "opening file"}}

3. right_click - Right click for context menu
   {{"action": "right_click", "x": 500, "y": 300, "description": "opening context menu"}}

4. type - Type text (use for any text input)
   {{"action": "type", "text": "hello world", "description": "typing search query"}}

5. hotkey - Keyboard shortcuts
   {{"action": "hotkey", "keys": ["ctrl", "c"], "description": "copying text"}}

6. key - Single key press
   {{"action": "key", "key": "enter", "description": "pressing enter"}}

7. scroll - Scroll up/down
   {{"action": "scroll", "direction": "down", "amount": 5, "x": 500, "y": 400, "description": "scrolling page"}}

8. move - Move mouse without clicking
   {{"action": "move", "x": 500, "y": 300, "description": "hovering over element"}}

9. drag - Click and drag
   {{"action": "drag", "start_x": 100, "start_y": 100, "end_x": 300, "end_y": 300, "description": "dragging file"}}

10. wait - Wait for something to load
    {{"action": "wait", "seconds": 2, "description": "waiting for page load"}}

11. done - Task completed successfully
    {{"action": "done", "message": "Successfully completed the task", "summary": "What was accomplished"}}

12. error - Cannot complete task
    {{"action": "error", "message": "Why it failed", "suggestion": "What user could try"}}

13. ask - Need clarification from user
    {{"action": "ask", "question": "What would you like me to do?"}}

IMPORTANT RULES:
1. LOOK CAREFULLY at the screenshot to find exact UI element positions
2. Coordinates must be PRECISE - estimate center of buttons/links
3. For text fields, CLICK first to focus, then TYPE
4. Break complex tasks into simple steps - ONE action at a time
5. After clicking, wait for UI to respond before next action
6. If you see a loading indicator, use "wait" action
7. Use "ask" if the command is ambiguous
8. Describe what you're doing in the "description" field
9. For typing URLs, include the full URL
10. Check if task is already done before acting

COMMON PATTERNS:
- Opening app: Click Start menu or taskbar icon
- Opening URL: Click address bar, clear it (Ctrl+A), type URL, press Enter
- Searching: Find search box, click it, type query, press Enter
- Closing window: Click X button (usually top-right)

RESPOND WITH ONLY THE JSON OBJECT. NO OTHER TEXT.
"""

    try:
        response = model.generate_content([
            prompt,
            {"mime_type": "image/png", "data": image_to_base64(screenshot)}
        ])
        
        response_text = response.text.strip()
        
        # Clean markdown code blocks if present
        if '```' in response_text:
            match = re.search(r'```(?:json)?\s*([\s\S]*?)```', response_text)
            if match:
                response_text = match.group(1).strip()
        
        return json.loads(response_text)
        
    except json.JSONDecodeError as e:
        return {"action": "error", "message": f"Failed to parse AI response", "suggestion": "Try rephrasing your command"}
    except Exception as e:
        return {"action": "error", "message": f"AI error: {str(e)}", "suggestion": "Check your internet connection"}

def execute_action(action_data):
    """Execute a single action and return result"""
    action = action_data.get('action')
    desc = action_data.get('description', '')
    
    try:
        if action == 'click':
            x, y = int(action_data['x']), int(action_data['y'])
            button = action_data.get('button', 'left')
            pyautogui.click(x, y, button=button)
            return f"Clicked at ({x}, {y}): {desc}"
            
        elif action == 'double_click':
            x, y = int(action_data['x']), int(action_data['y'])
            pyautogui.doubleClick(x, y)
            return f"Double-clicked at ({x}, {y}): {desc}"
            
        elif action == 'right_click':
            x, y = int(action_data['x']), int(action_data['y'])
            pyautogui.rightClick(x, y)
            return f"Right-clicked at ({x}, {y}): {desc}"
            
        elif action == 'type':
            text = action_data['text']
            # Use pyperclip for reliable typing (handles special chars)
            try:
                import pyperclip
                pyperclip.copy(text)
                pyautogui.hotkey('ctrl', 'v')
            except:
                pyautogui.write(text, interval=0.02)
            return f"Typed: {text[:50]}{'...' if len(text) > 50 else ''}"
            
        elif action == 'hotkey':
            keys = action_data['keys']
            pyautogui.hotkey(*keys)
            return f"Pressed: {'+'.join(keys)}"
            
        elif action == 'key':
            key = action_data['key']
            pyautogui.press(key)
            return f"Pressed: {key}"
            
        elif action == 'scroll':
            direction = action_data.get('direction', 'down')
            amount = action_data.get('amount', 3)
            x = action_data.get('x')
            y = action_data.get('y')
            
            if x and y:
                pyautogui.moveTo(int(x), int(y))
            
            scroll_amount = amount if direction == 'up' else -amount
            pyautogui.scroll(scroll_amount)
            return f"Scrolled {direction}: {desc}"
            
        elif action == 'move':
            x, y = int(action_data['x']), int(action_data['y'])
            pyautogui.moveTo(x, y, duration=0.2)
            return f"Moved to ({x}, {y}): {desc}"
            
        elif action == 'drag':
            sx, sy = int(action_data['start_x']), int(action_data['start_y'])
            ex, ey = int(action_data['end_x']), int(action_data['end_y'])
            pyautogui.moveTo(sx, sy)
            pyautogui.drag(ex - sx, ey - sy, duration=0.3)
            return f"Dragged from ({sx},{sy}) to ({ex},{ey}): {desc}"
            
        elif action == 'wait':
            seconds = action_data.get('seconds', 1)
            time.sleep(seconds)
            return f"Waited {seconds}s: {desc}"
            
        elif action == 'done':
            summary = action_data.get('summary', action_data.get('message', 'Task completed'))
            return f"[DONE] {summary}"
            
        elif action == 'error':
            msg = action_data.get('message', 'Unknown error')
            suggestion = action_data.get('suggestion', '')
            return f"[ERROR] {msg}" + (f" - {suggestion}" if suggestion else "")
            
        elif action == 'ask':
            question = action_data.get('question', 'What would you like me to do?')
            return f"[QUESTION] {question}"
            
        else:
            return f"Unknown action: {action}"
            
    except Exception as e:
        return f"[ERROR] Action failed: {str(e)}"

def process_command(command):
    """Process a command with multi-step execution like Vy"""
    global conversation_history
    
    max_steps = 30  # Allow more steps for complex tasks
    step = 0
    step_history = []
    
    # Add to conversation history
    conversation_history.append({"role": "user", "content": command})
    
    while step < max_steps:
        step += 1
        
        # Capture current screen
        screenshot = capture_screen()
        
        # Build context from previous steps
        step_context = ""
        if step_history:
            step_context = "PREVIOUS STEPS IN THIS TASK:\n"
            for i, s in enumerate(step_history[-5:], 1):  # Last 5 steps
                step_context += f"{i}. {s}\n"
            step_context += f"\nThis is step {step}. Continue the task or mark as done if complete."
        
        # Get next action from AI
        action_data = analyze_screen(command, screenshot, step_context)
        
        # Execute the action
        result = execute_action(action_data)
        step_history.append(result)
        
        # Check terminal states
        if action_data.get('action') in ['done', 'error', 'ask']:
            conversation_history.append({"role": "assistant", "content": result})
            return result
        
        # Brief pause between actions
        time.sleep(0.3)
    
    return "[ERROR] Task took too many steps. Try breaking it into smaller commands."

def main():
    """Main entry point"""
    print("Kazi Agent ready!", flush=True)
    
    while True:
        try:
            command = input().strip()
            
            if not command:
                continue
                
            if command.lower() in ['exit', 'quit', 'bye']:
                print("Goodbye!", flush=True)
                break
            
            # Process the command
            result = process_command(command)
            print(result, flush=True)
            
        except EOFError:
            break
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[ERROR] {str(e)}", flush=True)

if __name__ == '__main__':
    main()
