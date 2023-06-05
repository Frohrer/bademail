# Bademail.io

[![CI Main](https://github.com/Frohrer/bademail/actions/workflows/main-build.yml/badge.svg)](https://github.com/Frohrer/bademail/actions/workflows/main-build.yml)
[![Dependency Review](https://github.com/Frohrer/bademail/actions/workflows/dependency-review.yml/badge.svg)](https://github.com/Frohrer/bademail/actions/workflows/dependency-review.yml)
[![SAST](https://github.com/Frohrer/bademail/actions/workflows/sast.yml/badge.svg)](https://github.com/Frohrer/bademail/actions/workflows/sast.yml)
[![CI Beta](https://github.com/Frohrer/bademail/actions/workflows/beta-build.yml/badge.svg)](https://github.com/Frohrer/bademail/actions/workflows/beta-build.yml)

Bademail.io is a bot designed to analyze emails for phishing attempts and provide recommendations. It's a tool that helps users identify suspicious emails and understand the potential risks associated with them.

## How it Works

1. Forward an email to hi@bademail.io
2. The Bademail.io bot will analyze the email for phishing and provide recommendations.

The bot examines the email content, sender's details, and other relevant information to determine if the email is a phishing attempt. It then provides a verdict along with recommendations on how to handle the suspicious email.

## Note

Bademail.io is currently in testing phase and is not 100% accurate. Always confirm with a third party if you are not sure. Do not use for commercial purposes, aka your company email. 

## Using this repo

### Requirements

NodeJS v16 or higher
OpenAI GPT-4 API access
Bing API key
SMTP service (Sendgrid, Mailgun)

### Install

```
git clone https://github.com/Frohrer/bademail.git
npm install
npm start (port 25 will require elevated permissions)
```

## Creator

Originally created by Fred Rohrer in 2020.
