import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageEditorComponent } from './image-editor.component';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [ImageEditorComponent],
  exports: [ImageEditorComponent]
})
export class ImageEditorModule { }
