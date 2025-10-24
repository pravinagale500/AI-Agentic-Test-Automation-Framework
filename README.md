# AI Agentic Test Automation Framework

An innovative test automation framework that leverages AI to dynamically generate and execute end-to-end tests based on natural language prompts. This framework combines the power of OpenAI's GPT models with Playwright for robust web automation.

## 🚀 Features

- **AI-Powered Test Generation**: Automatically converts natural language prompts into executable test scripts
- **Dynamic Page Object Generation**: Creates page objects on-the-fly based on application analysis
- **Smart Test Orchestration**: Manages test execution flow with retry mechanisms and error handling
- **Environment Management**: Supports multiple environments (QA, UAT, PROD)
- **Detailed Logging**: Comprehensive logging system with Winston for better debugging
- **Type Safety**: Built with TypeScript for better code quality and maintainability

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)
- OpenAI API Key
- TypeScript knowledge for framework extension

## 🛠️ Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Create a `.env` file based on `.env.example`:
```bash
ENV=qa
OPENAI_API_KEY=your_api_key_here
BASE_URL_QA=https://demo.opencart.com
USERNAME_QA=demo@opencart.com
PASSWORD_QA=demo123
```

## 📂 Project Structure

```
src/
├── agents/              # AI agents for test and POM generation
│   ├── aiClient.ts     # OpenAI API client
│   ├── pomGenerator.ts # Page Object Model generator
│   └── testGenerator.ts# Test script generator
├── orchestrator/        # Test execution orchestration
│   └── orchestrator.ts
├── server/             # Web server for results and monitoring
│   └── server.ts
└── utils/              # Utility functions
    ├── rerunHandler.ts # Test rerun management
    └── safeActions.ts  # Safe browser interactions
```

## 🎯 Usage

### Running Tests

Run a specific test prompt:
```bash
npm run ai:run <prompt-tag>
```

Run with debug logging:
```bash
npm run ai:run:debug <prompt-tag>
```

### Test Prompts

Test prompts are stored in `prompts/regressionPrompts.json`. Example format:
```json
{
  "login_search_valid": {
    "description": "Login, search valid product and verify it appears",
    "prompt": "Login with valid user, search for 'MacBook', verify product appears"
  }
}
```

## 🔍 Key Components

### AI Client (aiClient.ts)
- Handles communication with OpenAI API
- Manages model configurations and retries
- Processes natural language into structured test instructions

### POM Generator (pomGenerator.ts)
- Analyzes web pages to generate Page Object Models
- Creates reusable page interactions
- Maintains element selectors and actions

### Test Generator (testGenerator.ts)
- Converts AI responses into executable test scripts
- Handles test flow and assertions
- Manages test data and variables

### Orchestrator (orchestrator.ts)
- Controls test execution flow
- Manages environment configurations
- Handles retries and error recovery

## 🔧 Configuration

### Environment Variables
- `ENV`: Environment to run tests against (qa/uat/prod)
- `OPENAI_API_KEY`: Your OpenAI API key
- `BASE_URL_*`: Base URL for each environment
- `USERNAME_*`: Test username for each environment
- `PASSWORD_*`: Test password for each environment

### Test Configuration
- Model selection (GPT-3.5-turbo/GPT-4)
- Retry attempts and delays
- Timeout settings
- Custom system prompts

## 📝 Logging

The framework uses Winston for structured logging with multiple transports:
- Console logging for real-time feedback
- File logging for debugging and analysis
- Different log levels (error, warn, info, debug)

Log files:
- `error.log`: Error-level messages
- `ai-client.log`: AI interaction logs
- `test-generator.log`: Test generation logs
- `orchestrator.log`: Execution flow logs
- `rerun.log`: Test rerun details

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔎 Troubleshooting

Common issues and solutions:

1. OpenAI API Rate Limits
   - Check API key quota
   - Implement rate limiting
   - Use retry mechanism

2. Test Generation Failures
   - Check prompt format
   - Verify environment variables
   - Review AI model responses

3. Browser Automation Issues
   - Check element selectors
   - Verify page load states
   - Review timeout settings

## 📮 Support

For issues and feature requests, please create an issue in the repository.