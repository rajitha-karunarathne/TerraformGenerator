# Run and deploy your TerraformGenerator app

This is an AI-powered application designed to generate Terraform Infrastructure as Code (IaC) scripts. Simply upload your architecture diagram, select the relevant Cloud Service Provider (CSP), and the application will output organized Terraform code across multiple files.

This repository contains everything you need to run the application locally.

## ✨ Features

*   **Architecture Diagram Input:** Upload common diagram formats (e.g., PNG, JPG, SVG - specify supported formats).
*   **Cloud Provider Selection:** Supports [List Supported CSPs, e.g., AWS, Azure, GCP].
*   **AI-Powered Generation:** Leverages AI to interpret diagrams and generate corresponding Terraform code.
*   **Modular Output:** Generates well-structured Terraform code split into multiple files (e.g., `main.tf`, `variables.tf`, `outputs.tf`, provider-specific resource files).
*   **Local Development Ready:** Includes all necessary configurations to run and test the application on your local machine.

  ![Screenshot 2025-05-21 210351](https://github.com/user-attachments/assets/6c5cd612-5fa0-4bd8-a2e8-8724a9611290)

  ![Screenshot 2025-05-21 210410](https://github.com/user-attachments/assets/8d3ce52b-6bb2-40ae-bde8-7c4c5d30df2b)

  ![Screenshot 2025-05-21 210522](https://github.com/user-attachments/assets/bc5fd0e8-32d8-482f-99ff-82ae819d31e8)

  ![Screenshot 2025-05-21 210549](https://github.com/user-attachments/assets/b51a3c64-8792-4741-8392-d6a4fc9020a1)

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
