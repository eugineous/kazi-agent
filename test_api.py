import google.generativeai as genai
import warnings
warnings.filterwarnings('ignore')

API_KEY = "AIzaSyBS7B1aEmw67nRbnt-TP4ejkitVAKEa3iM"
genai.configure(api_key=API_KEY)

print("Available models:")
for m in genai.list_models():
    if 'generateContent' in m.supported_generation_methods:
        print(f"  - {m.name}")
