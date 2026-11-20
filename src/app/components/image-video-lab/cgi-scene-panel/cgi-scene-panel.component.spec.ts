import { TestBed } from '@angular/core/testing';
import { CgiScenePanelComponent } from './cgi-scene-panel.component';
import {
  MAX_CGI_OBJECTS,
  createCgiPrimitive,
  createDefaultCgiScene,
  setCgiKeyframe,
  type CgiSceneSettings,
} from '../../../services/cgi-scene';

describe('CgiScenePanelComponent', () => {
  const create = (scene: CgiSceneSettings, playhead = 0) => {
    TestBed.configureTestingModule({ imports: [CgiScenePanelComponent] });
    const fixture = TestBed.createComponent(CgiScenePanelComponent);
    fixture.componentRef.setInput('scene', scene);
    fixture.componentRef.setInput('playhead', playhead);
    fixture.detectChanges();
    const emitted: CgiSceneSettings[] = [];
    fixture.componentInstance.sceneChange.subscribe((value) =>
      emitted.push(value),
    );
    return { component: fixture.componentInstance, emitted, fixture };
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

  it('refuses a 13th object instead of letting a reload truncate it', () => {
    const scene = createDefaultCgiScene();
    scene.objects = Array.from({ length: MAX_CGI_OBJECTS }, (_, index) =>
      createCgiPrimitive('cube', index),
    );
    const { component, emitted } = create(scene);

    expect(component.atObjectLimit()).toBe(true);
    component.addPrimitive();

    expect(emitted).toHaveLength(0);
    expect(component.sceneError()).toContain('cap');
  });

  it('writes a key at the playhead on the scene channel', () => {
    const { component, emitted } = create(createDefaultCgiScene(), 2);

    component.addKeyframe();

    expect(emitted).toHaveLength(1);
    const track = emitted[0].animation?.tracks[0];
    expect(track?.targetObjectId).toBeNull();
    expect(track?.channel).toBe('camera.distance');
    expect(track?.keys[0].time).toBe(2);
    // The value field is seeded from what the renderer shows at the playhead.
    expect(track?.keys[0].value).toBe(6);
  });

  it('keys an object channel and can clear the track again', () => {
    const { component, emitted } = create(createDefaultCgiScene(), 1);
    component.setAnimTarget('cgi-torus');
    expect(component.channelSpec().id).toBe('position.x');

    component.addKeyframe();
    expect(emitted[0].animation?.tracks[0].targetObjectId).toBe('cgi-torus');
    expect(emitted[0].animation?.tracks[0].channel).toBe('position.x');

    component.clearTrack('position.x');
    expect(emitted[1].animation?.tracks ?? []).toHaveLength(0);
  });

  it('keeps a typed value when the playhead moves', () => {
    const { component, emitted, fixture } = create(createDefaultCgiScene(), 0);
    component.setKeyframeValue('3');
    fixture.componentRef.setInput('playhead', 4);
    fixture.detectChanges();

    component.addKeyframe();

    expect(emitted[0].animation?.tracks[0].keys[0]).toMatchObject({
      time: 4,
      value: 3,
    });
  });

  it('removes a single key from a track', () => {
    const scene = setCgiKeyframe(
      createDefaultCgiScene(),
      null,
      'camera.distance',
      1,
      6,
    );
    const keyId = scene.animation!.tracks[0].keys[0].id;
    const { component, emitted } = create(scene, 1);

    component.removeKey('camera.distance', keyId);

    expect(emitted[0].animation?.tracks ?? []).toHaveLength(0);
  });
});
