# StegaVault Proposed Architecture

## 1. System Overview
StegaVault is a secure note management system utilizing AES-256-GCM encryption and Least Significant Bit (LSB) image steganography. This document outlines the proposed production-ready architecture designed for a complete, scalable backend implementation.

> **CA2 Prototype Note:**
> The current prototype at the project root focuses on demonstrating the core User/Attacker workflow and concept validation using vanilla technologies and Python scripts. 
> 
> **Proposed Architecture:**
> This `architecture/` directory represents the planned modular implementation using Flask, SQLAlchemy, SQLite, AES-256-GCM, Pillow, and AI-assisted adaptive embedding. It serves as a reference for the PBL jury.

## 2. Technology Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Python 3.x, Flask
- **Database**: SQLite, SQLAlchemy ORM
- **Security**: AES-256-GCM, PBKDF2-HMAC-SHA256, Werkzeug Password Hashing
- **Image Processing**: Pillow (PIL)
- **Steganography**: LSB (Least Significant Bit)
- **AI Research Extension**: PyTorch, U-Net Architecture

## 3. Frontend Layer
Located in `frontend/`. 
The frontend relies on standard HTML/JS/CSS to communicate with the Flask API via asynchronous `fetch` requests, decoupling the UI from the backend rendering.

## 4. Backend Layer
Located in `backend/`.
Uses Flask Blueprints to route requests for Auth, Notes, and Images. Business logic is separated into a `services/` layer, keeping the route controllers clean.

## 5. Database Layer
Located in `database/`.
Uses SQLite with SQLAlchemy. Contains tables for Users, Notes, and Secure Images. Models are mapped in `backend/models/`.

## 6. Security Layer
Located in `security/`.
Provides robust encryption (AES-256-GCM with authentication tags), secure PBKDF2 key derivation from user passwords, and separate standard password hashing for authentication.

## 7. Steganography Layer
Located in `security/steganography.py`.
Responsible for hiding the AES-encrypted binary payload into the carrier image using LSB modification.

## 8. AI Research Layer
Located in `ai/`.
A placeholder module for future research. Uses a lightweight U-Net architecture to determine optimal embedding regions in a carrier image to bypass steganalysis.

## 9. Data Flow Pipeline

**Creating a Secure Note:**
USER NOTE -> FLASK API -> NOTE SERVICE -> KEY DERIVATION -> AES-256-GCM -> ENCRYPTED PAYLOAD -> AI-ASSISTED EMBEDDING MAP (FUTURE) -> LSB STEGANOGRAPHY -> PILLOW -> STEGO IMAGE -> SQL DATABASE METADATA

**Retrieving a Secure Note:**
STEGO IMAGE -> PILLOW -> LSB EXTRACTION -> AES-256-GCM -> ORIGINAL NOTE

## 10. User Flow
User logs in -> Views Dashboard -> Creates Note -> Selects Carrier Image -> System Encrypts and Embeds -> Note stored and visible to User.

## 11. Attacker Flow
Attacker attempts to view storage -> Only sees standard images -> Lacks derived key and logic to extract the invisible payload.

## 12. Future Scope
Integration of the PyTorch AI model for adaptive steganography to evade advanced statistical steganalysis tools.
