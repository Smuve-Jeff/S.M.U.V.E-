import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { EqPanelComponent } from './components/eq-panel/eq-panel.component';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { ImageEditorComponent } from './components/image-editor/image-editor.component';
import { AudioVisualizerComponent } from './components/audio-visualizer/audio-visualizer.component';
import { PianoRollComponent } from './components/piano-roll/piano-roll.component';
import { NetworkingComponent } from './components/networking/networking.component';
import { ProfileEditorComponent } from './components/profile-editor/profile-editor.component';
import { HubComponent } from './hub/hub.component';
import { StudioComponent } from './components/studio/studio.component';
import { ProjectsComponent } from './components/projects/projects.component';
import { DjDeckComponent } from './components/dj-deck/dj-deck.component';

@NgModule({
  declarations: [
    ChatbotComponent,
    ImageEditorComponent,
    EqPanelComponent,
    AudioVisualizerComponent,
    PianoRollComponent,
    NetworkingComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppComponent,
    ProfileEditorComponent,
    HubComponent,
    StudioComponent,
    ProjectsComponent,
    DjDeckComponent,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
