<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This project has been updated to Angular 18.

View your app in AI Studio: https://ai.studio/apps/drive/18_LFsCNNH60Tzi4X6U37bWCNxFSfRBUa

## Run Locally

**Prerequisites:**

*   **Node.js:** This project requires Node.js version `24.12.0` or higher. We recommend using [nvm](https://github.com/nvm-sh/nvm) to manage your Node.js versions.

    To install `nvm`, run the following command:
    ```bash
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
    ```

    Once `nvm` is installed, you can install and use the required Node.js version:
    ```bash
    nvm install 24.12.0
    nvm use 24.12.0
    ```

**Setup:**

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Set Gemini API Key:**
    Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key.
3.  **Run the app:**
    ```bash
    npm run dev
    ```

## Features

This AI-powered music studio is a comprehensive and interactive creative environment for musical artists. It features a powerful AI assistant that has complete control over the application, enabling users to make changes and create music through conversational commands.

*   **AI-Powered Control:** The entire application can be manipulated by the AI assistant. Users can request changes to the interface, create music, and get personalized guidance, all through a chat-based interface.
*   **Music Creation and Mimicry:** The AI can generate music, mimic the style of other artists, and even simulate singing on a track, providing text-based output of the musical creation.
*   **Personalized Artist Intelligence:** The application builds a detailed profile of the user, allowing the AI to provide highly personalized advice, recommendations, and strategies based on the artist's strengths, weaknesses, and goals.
*   **DJ Decks:** The application includes a DJ deck interface for playing and mixing tracks.
*   **Reactive Studio Interface:** The main user interface is a reactive studio environment built with Angular Signals, providing a modern and efficient user experience.
*   **Speech-to-Text:** The profile editor includes speech recognition, allowing artists to update their information using their voice.
*   **Context-Awareness:** The application maintains a "short-term memory" of user actions, allowing the AI to have a better understanding of the user's current context.

## Technology Stack

*   **Angular 18:** The application is built with the latest version of Angular, leveraging new features like Angular Signals for a more reactive and efficient development experience.
*   **Firebase:** Firebase is used for hosting the application.
*   **Google AI:** The application uses the Google AI API to power the AI assistant.
*   **TypeScript:** The application is written in TypeScript, providing type safety and improved developer tooling.

## Deployment

You can deploy this application to Firebase Hosting using the following command:

```bash
firebase deploy --only hosting
```
