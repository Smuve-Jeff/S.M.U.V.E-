import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ProfileEditorComponent } from './profile-editor.component';
import { FormFieldComponent } from './form-field.component';

const routes: Routes = [
  { path: '', component: ProfileEditorComponent }
];

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    ProfileEditorComponent,
    FormFieldComponent
  ],
})
export class ProfileEditorModule { }
