import requests
import json
import sys
import os

# Import the exact same payload we used for the local test
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
from backend.scripts.test_data import payload

# The URL where your FastAPI server is listening locally
API_URL = "http://127.0.0.1:8000/generate-schedule"

print("Sending HTTP POST request to the local API...\n")

# Send the Pydantic model as a JSON dictionary over the network
response = requests.post(API_URL, json=payload.model_dump())

if response.status_code == 200:
    print("✅ API responded successfully!\n")
    # Print the returned schedule JSON nicely formatted
    print(json.dumps(response.json(), indent=2))
else:
    print(f"❌ API Error: {response.status_code}")
    print(response.text)