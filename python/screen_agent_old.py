#!/usr/bin/env python3
"""
KAZI - AI Desktop Agent
Core screen control and vision processing
"""

import os
import sys
import json
import time
import base64
import pyautogui
import mss
import mss.tools
from io import BytesIO
from PIL import Image
from dotenv import load_dotenv

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stdin.reconfigure(encoding='utf-8')

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

import google.generativeai as genai

# Configure Gemini
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    print("ERROR: GEMINI_API_KEY not found in .env file")
    sys.exit(1)

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash-exp')

# Safety settings
pyautogui.FAILSAFE = True  # Move mouse to corner to abort
pyautogui.PAUSE = 0.5  # Pause between actions

def capture_screen():
    """Capture the entire screen and return as PIL Image"""
    with mss.mss() as sct:
        monitor = sct.monitors[1]  # Primary monitor
        screenshot = sct.grab(monitor)
        img = Image.frombytes('RGB', screenshot.size, screenshot.bgra, 'raw', 'BGRX')
        return img

def image_to_base64(img):
    """Convert PIL Image to base64 string"""
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

def analyze_screen_and_plan(command, screenshot):
    """Send screenshot to Gemini and get action plan"""
    
    prompt = f"""You are KAZI, an AI desktop agent. You can see the user's screen and must help them complete tasks.

USER COMMAND: {command}

ANALYZE THE SCREENSHOT AND RESPOND WITH A JSON ACTION PLAN.

Available actions:
- click: {{"action": "click", "x": 100, "y": 200, "description": "what you're clicking"}}
- double_click: {{"action": "double_click", "x": 100, "y": 200, "description": "what you're clicking"}}
- right_click: {{"action": "right_click", "x": 100, "y": 200, "description": "what you're clicking"}}
- type: {{"action": "type", "text": "text to type", "description": "what you're typing"}}
- hotkey: {{"action": "hotkey", "keys": ["ctrl", "c"], "description": "keyboard shortcut"}}
- scroll: {{"action": "scroll", "direction": "up" or "down", "amount": 3, "description": "scrolling"}}
- wait: {{"action": "wait", "seconds": 2, "description": "waiting for something"}}
- done: {{"action": "done", "message": "Task completed successfully"}}
- error: {{"action": "error", "message": "Explanation of why task cannot be done"}}

RULES:
1. Look at the ACTUAL screen content to find UI elements
2. Provide EXACT pixel coordinates for clicks (estimate based on element positions)
3. Break complex tasks into simple sequential steps
4. Return ONLY ONE action at a time
5. Use "done" when the task is complete
6. Use "error" if the task is impossible

RESPOND WITH ONLY THE JSON OBJECT, NO OTHER TEXT.
"""

    try:
        response = model.generate_content([
            prompt,
            {"mime_type": "image/png", "data": image_to_base64(screenshot)}
        ])
        
        # Extract JSON from response
        response_text = response.text.strip()
        
        # Clean up response if it has markdown code blocks
        if response_text.startswith('```'):
            response_text = response_text.split('\n', 1)[1]
            response_text = response_text.rsplit('```', 1)[0]
        
        return json.loads(response_text)
        
    except json.JSONDecodeError as e:
        return {"action": "error", "message": f"Failed to parse AI response: {e}"}
    except Exception as e:
        return {"action": "error", "message": f"AI error: {e}"}

def execute_action(action_data):
    """Execute a single action"""
    action = action_data.get('action')
    
    try:
        if action == 'click':
            x, y = action_data['x'], action_data['y']
            pyautogui.click(x, y)
            return f"Clicked at ({x}, {y}): {action_data.get('description', '')}"
            
        elif action == 'double_click':
            x, y = action_data['x'], action_data['y']
            pyautogui.doubleClick(x, y)
            return f"Double-clicked at ({x}, {y}): {action_data.get('description', '')}"
            
        elif action == 'right_click':
            x, y = action_data['x'], action_data['y']
            pyautogui.rightClick(x, y)
            return f"Right-clicked at ({x}, {y}): {action_data.get('description', '')}"
            
        elif action == 'type':
            text = action_data['text']
            pyautogui.typewrite(text, interval=0.02)
            return f"Typed: {text}"
            
        elif action == 'hotkey':
            keys = action_data['keys']
            pyautogui.hotkey(*keys)
            return f"Pressed: {'+'.join(keys)}"
            
        elif action == 'scroll':
            direction = action_data.get('direction', 'down')
            amount = action_data.get('amount', 3)
            scroll_amount = amount if direction == 'up' else -amount
            pyautogui.scroll(scroll_amount)
            return f"Scrolled {direction} by {amount}"
            
        elif action == 'wait':
            seconds = action_data.get('seconds', 1)
            time.sleep(seconds)
            return f"Waited {seconds} seconds"
            
        elif action == 'done':
            return f"[DONE] {action_data.get('message', 'Task completed')}"
            
        elif action == 'error':
            return f"[ERROR] {action_data.get('message', 'Unknown error')}"
            
        else:
            return f"Unknown action: {action}"
            
    except Exception as e:
        return f"Action failed: {e}"

def process_command(command):
    """Main loop to process a command until completion"""
    max_steps = 20  # Prevent infinite loops
    step = 0
    
    while step < max_steps:
        step += 1
        
        # Capture current screen state
        screenshot = capture_screen()
        
        # Get next action from AI
        action_data = analyze_screen_and_plan(command, screenshot)
        
        # Execute the action
        result = execute_action(action_data)
        
        # Check if we're done
        if action_data.get('action') in ['done', 'error']:
            return result
            
        # Small delay between actions
        time.sleep(0.3)
    
    return "[ERROR] Task took too many steps, stopped for safety"

def main():
    """Main entry point - reads commands from stdin"""
    print("Kazi Agent ready!", flush=True)
    
    while True:
        try:
            # Read command from Electron
            command = input().strip()
            
            if not command:
                continue
                
            if command.lower() in ['exit', 'quit']:
                break
            
            # Process the command
            result = process_command(command)
            
            # Send result back to Electron
            print(result, flush=True)
            
        except EOFError:
            break
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error: {e}", flush=True)

if __name__ == '__main__':
    main()
