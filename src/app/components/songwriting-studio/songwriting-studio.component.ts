import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Songwriting Studio — one workspace for words and co-writing.
 *
 * The Writer's Pad (solo lyrics, pages, book manuscript) and the Co-Write
 * room (AI session turns, melody, harmony, projects) live here as tabs
 * instead of two disconnected routes. Legacy `/lyric-editor` and `/cowrite`
 * URLs redirect into the matching tab.
 */
@Component({
  selector: 'app-songwriting-studio',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './songwriting-studio.component.html',
  styleUrls: ['./songwriting-studio.component.css'],
})
export class SongwritingStudioComponent {}
