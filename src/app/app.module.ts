import { NgModule, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { AppComponent } from './app.component';
import { GameService } from './hub/game.service';
import { WebsocketService } from './services/websocket.service';
import { ModalComponent } from './hub/modal.component';
import { AppRoutingModule } from './app-routing.module';
import { EqPanelComponent } from './components/eq-panel/eq-panel.component';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { ImageEditorComponent } from './components/image-editor/image-editor.component';
import { AudioVisualizerComponent } from './components/audio-visualizer/audio-visualizer.component';
import { PianoRollComponent } from './components/piano-roll/piano-roll.component';
import { NetworkingComponent } from './components/networking/networking.component';
import { ProfileEditorComponent } from './components/profile-editor/profile-editor.component';
import { StudioInterfaceComponent } from './components/studio-interface/studio-interface.component';
import { AiService, API_KEY_TOKEN } from './services/ai.service';
import { DjDeckComponent } from './components/dj-deck/dj-deck.component';
import { LoginComponent } from './components/login/login.component';
import { SampleLibraryComponent } from './components/sample-library/sample-library.component';
import { ServiceWorkerModule } from '@angular/service-worker';
import { routes } from './app.routes';
import { RouterModule } from '@angular/router';

@NgModule({
  declarations: [
    AppComponent,
    ModalComponent,
    EqPanelComponent,
    ChatbotComponent,
    ImageEditorComponent,
    AudioVisualizerComponent,
    PianoRollComponent,
    NetworkingComponent,
    ProfileEditorComponent,
    StudioInterfaceComponent,
    DjDeckComponent,
    LoginComponent,
    SampleLibraryComponent
  ],
  imports: [
    BrowserModule,
    CommonModule,
    HttpClientModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule.forRoot(routes),
    NoopAnimationsModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    }),
  ],
  providers: [
    GameService, 
    WebsocketService, 
    AiService, 
    { provide: API_KEY_TOKEN, useValue: '' }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
