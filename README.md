# TlahtolliAI

Follow these steps to set up and run the **TlahtolliAI** application.

---

## 1. Export and Create Conda Environment

Export your current conda environment to a YAML file:
```bash
conda env export > environment.yml
```
Create a new environment from the exported YAML file:
```bash
conda env create -f environment.yml
```
Activate the newly created environment:
```bash
conda activate myenv
```

## 2. Set OpenAI API Key
Set your OpenAI API key as an environment variable:
```bash
export OPENAI_API_KEY="your_api_key_here"
```
Verify that it is set correctly:
```bash
echo $OPENAI_API_KEY
```

## 3. Run the FastAPI Server
Start the application using Uvicorn:
```bash
uvicorn main:app --host localhost --port 8080 --reload
```
```bash
Note:
The --reload flag allows the server to automatically restart when code changes are detected.
```
Now you can access the TlahtolliAI API at:
```bash
http://localhost:8080/docs
```

## 4. FastAPI Endpoints
<img width="1220" height="430" alt="Screenshot 2025-09-14 at 9 05 50 p m" src="https://github.com/user-attachments/assets/de1e075c-e110-4ecd-8e31-35869f8ba612" />
