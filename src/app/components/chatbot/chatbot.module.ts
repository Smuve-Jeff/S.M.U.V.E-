import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatbotComponent } from './chatbot.component';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [ChatbotComponent],
  exports: [ChatbotComponent]
})
export class ChatbotModule { }
