# AstroWatch AI 🌌

AstroWatch AI is a full-stack Near-Earth Object monitoring and
educational visualization platform.

It retrieves asteroid close-approach information from NASA NeoWs,
presents available measurements, and offers an interactive 3D
illustration of Earth's orbital neighborhood.

## Features

- NASA NeoWs API integration
- Close-approach dashboard
- Asteroid search and filtering
- Estimated diameter and velocity charts
- Interactive Three.js visualization
- Basic orbital calculations
- Missing-data handling
- Scientific methodology and limitations

## Technology Stack

Frontend:
- HTML5
- CSS3
- JavaScript
- Three.js
- Chart.js

Backend:
- Python
- Flask
- Flask-CORS
- Requests

Data:
- NASA Near-Earth Object Web Service (NeoWs)

## Project Structure

frontend/
  index.html
  style.css
  script.js

backend/
  app.py
  nasa_service.py
  orbital_calculations.py
  requirements.txt

## Requirements

- Python 3.10 or newer
- Internet connection for NASA API and CDN resources
- Modern browser with WebGL support

## Installation

Open a terminal in the project root.

Create a virtual environment:

    python -m venv .venv

Activate it on Windows:

    .venv\Scripts\activate

Install backend dependencies:

    pip install -r backend/requirements.txt

## Configure NASA API

The application defaults to NASA's DEMO_KEY.

For regular development, obtain an API key from:

https://api.nasa.gov/

Set the environment variable before starting the backend.

Windows PowerShell:

    $env:NASA_API_KEY="your_key_here"

macOS/Linux:

    export NASA_API_KEY="your_key_here"

## Run the Backend

From the project root:

    cd backend
    python app.py

The local backend will run at:

    http://127.0.0.1:5000

Health endpoint:

    http://127.0.0.1:5000/api/health

## Run the Frontend

Open a second terminal in the project root.

Start a static server:

    python -m http.server 5500 --directory frontend

Open:

    http://127.0.0.1:5500

The frontend calls the Flask backend at:

    http://127.0.0.1:5000/api

## Scientific Limitations

- NeoWs records do not provide every orbital element.
- Missing values are not replaced with fabricated values.
- The 3D scene is illustrative, not a precision ephemeris.
- Orbital calculations use simplified assumptions.
- Close-approach distance does not establish impact probability.
- Potentially hazardous classification does not mean an impact
  is predicted.
- Charts summarize the selected records, not the entire NEO population.

## Data Sources

NASA API Portal:
https://api.nasa.gov/

NASA Center for Near-Earth Object Studies:
https://cneos.jpl.nasa.gov/

JPL Solar System Dynamics:
https://ssd.jpl.nasa.gov/

## Deployment

GitHub Pages can host the static frontend.

The Flask backend must be deployed separately to a Python-compatible
hosting provider.

Configure the frontend API base URL to point to the deployed backend.
Configure CORS to allow only the production frontend origin.

Never publish API credentials or commit a .env file.

## Project Purpose

AstroWatch AI is an educational and exploratory application.
It is not an official planetary-defense system and must not be used
for operational impact-risk decisions.
