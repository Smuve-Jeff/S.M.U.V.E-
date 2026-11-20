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

  /** A stage already holding the maximum number of objects. */
  const fullScene = () => {
    const scene = createDefaultCgiScene();
    scene.objects = Array.from({ length: MAX_CGI_OBJECTS }, (_, index) =>
      createCgiPrimitive('cube', index),
    );
    return scene;
  };

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
    const { component, emitted } = create(fullScene());

    expect(component.atObjectLimit()).toBe(true);
    component.addPrimitive();

    expect(emitted).toHaveLength(0);
    expect(component.sceneError()).toContain('cap');
  });

  it('refuses a model import at the object cap', () => {
    const { component, emitted } = create(fullScene());
    const file = new File(['glb'], 'hero.glb', {
      type: 'model/gltf-binary',
    });
    const event = {
      target: { files: [file], value: '' },
    } as unknown as Event;

    component.onModelFile(event);

    expect(emitted).toHaveLength(0);
    expect(component.sceneError()).toContain('cap');
  });

  it('drops an object\'s keyframe tracks when it is removed', () => {
    const scene = setCgiKeyframe(
      createDefaultCgiScene(),
      'cgi-torus',
      'position.x',
      0,
      2,
    );
    const { component, emitted } = create(scene);

    component.removeObject('cgi-torus');

    expect(emitted[0].objects).toHaveLength(0);
    expect(emitted[0].animation?.tracks ?? []).toHaveLength(0);
  });

  it('returns the keyframe editor to the scene when its target is removed', () => {
    const { component } = create(createDefaultCgiScene());
    component.setAnimTarget('cgi-torus');

    component.removeObject('cgi-torus');

    expect(component.animTarget()).toBe('');
    expect(component.channelSpec().scope).toBe('scene');
  });

  it('loads a key for editing when its chip is selected', () => {
    const scene = setCgiKeyframe(
      createDefaultCgiScene(),
      null,
      'camera.distance',
      2,
      4,
      'step',
    );
    const key = scene.animation!.tracks[0].keys[0];
    const { component } = create(scene, 0);

    component.selectKey('camera.distance', key.id);

    expect(component.animEasing()).toBe('step');
    expect(component.keyframeValue()).toBe(4);
    expect(component.selectedKey()?.id).toBe(key.id);
  });

  it('updates a selected key in place instead of deleting and re-adding it', () => {
    const scene = setCgiKeyframe(
      createDefaultCgiScene(),
      null,
      'camera.distance',
      2,
      4,
    );
    const key = scene.animation!.tracks[0].keys[0];
    const { component, emitted } = create(scene, 0);
    component.selectKey('camera.distance', key.id);

    component.setAnimEasing('linear');
    component.setKeyframeValue('7');
    component.updateKeyframe();

    const keys = emitted[0].animation!.tracks[0].keys;
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ time: 2, value: 7, easing: 'linear' });
    expect(component.selectedKey()).toBeNull();
  });

  it('deletes the selected key from the actions row', () => {
    const scene = setCgiKeyframe(
      createDefaultCgiScene(),
      null,
      'camera.distance',
      1,
      6,
    );
    const key = scene.animation!.tracks[0].keys[0];
    const { component, emitted } = create(scene, 0);
    component.selectKey('camera.distance', key.id);

    component.deleteSelectedKey();

    expect(emitted[0].animation?.tracks ?? []).toHaveLength(0);
    expect(component.selectedKey()).toBeNull();
  });

  it('writes the selected easing onto a new key', () => {
    const { component, emitted } = create(createDefaultCgiScene(), 1);

    component.setAnimEasing('step');
    component.addKeyframe();

    expect(emitted[0].animation?.tracks[0].keys[0].easing).toBe('step');
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
