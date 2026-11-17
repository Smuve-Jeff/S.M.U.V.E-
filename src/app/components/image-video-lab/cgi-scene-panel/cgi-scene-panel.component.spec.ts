import { TestBed } from '@angular/core/testing';
import { CgiScenePanelComponent } from './cgi-scene-panel.component';
import {
  createDefaultCgiScene,
  type CgiSceneSettings,
} from '../../../services/cgi-scene';

describe('CgiScenePanelComponent', () => {
  const create = (scene: CgiSceneSettings) => {
    TestBed.configureTestingModule({ imports: [CgiScenePanelComponent] });
    const fixture = TestBed.createComponent(CgiScenePanelComponent);
    fixture.componentRef.setInput('scene', scene);
    fixture.detectChanges();
    const emitted: CgiSceneSettings[] = [];
    fixture.componentInstance.sceneChange.subscribe((value) =>
      emitted.push(value),
    );
    return { component: fixture.componentInstance, emitted };
  };

  afterEach(() => TestBed.resetTestingModule());

  it('puts a new object in the first free slot beside the default torus', () => {
    const { component, emitted } = create(createDefaultCgiScene());

    component.addPrimitive();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].objects.map((object) => object.position)).toEqual([
      [0, 0, 0],
      [2.4, 0, 0],
    ]);
  });

  it('does not move objects that were already placed', () => {
    const scene = createDefaultCgiScene();
    scene.objects.push({
      id: 'existing',
      name: 'Existing Cube',
      kind: 'cube',
      color: '#f472b6',
      position: [2.4, 0, 0],
      scale: 1,
      spin: 1,
    });
    const { component, emitted } = create(scene);

    component.addPrimitive();

    expect(emitted[0].objects[0].position).toEqual([0, 0, 0]);
    expect(emitted[0].objects[1].position).toEqual([2.4, 0, 0]);
    expect(emitted[0].objects[2].position).toEqual([-2.4, 0, 0]);
  });
});
