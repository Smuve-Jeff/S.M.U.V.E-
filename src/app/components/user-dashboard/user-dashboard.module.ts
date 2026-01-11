import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChatbotComponent } from '../chatbot/chatbot.component';
import { ProfileEditorComponent } from '../profile-editor/profile-editor.component';
import { ImageEditorComponent } from '../image-editor/image-editor.component';
import { LegalDocumentEditorComponent } from '../legal-document-editor/legal-document-editor.component';
import { FormFieldComponent } from '../profile-editor/form-field.component';

const routes: Routes = [{ path: '', component: ProfileEditorComponent }];

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    FormsModule,
    ProfileEditorComponent,
    ImageEditorComponent,
    LegalDocumentEditorComponent,
    FormFieldComponent,
    ChatbotComponent,
  ],
})
export class UserDashboardModule {}
