import * as vtkMath from '@kitware/vtk.js/Common/Core/Math';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkRenderWindowInteractor from '@kitware/vtk.js/Rendering/Core/RenderWindowInteractor';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkPolyDataMapper from '@kitware/vtk.js/Rendering/Core/PolyDataMapper';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkLookupTable from '@kitware/vtk.js/Common/Core/LookupTable';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkCutter from '@kitware/vtk.js/Filters/Core/Cutter';
import vtkContourFilter from '@kitware/vtk.js/Filters/General/ContourFilter';

const MAX_CELLS_WARNING = 500000;
const MAX_CELLS_CRITICAL = 2000000;

class VtkRendererService {
  constructor() {
    this.container = null;
    this.renderer = null;
    this.renderWindow = null;
    this.glWindow = null;
    this.interactor = null;
    this.interactorStyle = null;
    
    this.actors = new Map();
    this.mappers = new Map();
    this.polyDatas = new Map();
    
    this.isInteractive = true;
    this.qualityMode = 'balanced';
    this.lastRenderTime = 0;
    this.frameCount = 0;
    this.fps = 60;
    
    this.stats = {
      totalCells: 0,
      totalPoints: 0,
      memoryMB: 0
    };
  }

  initialize(container) {
    if (this.renderer) {
      this.dispose();
    }

    this.container = container;
    
    this.renderer = vtkRenderer.newInstance({ background: [0.1, 0.1, 0.15] });
    this.renderWindow = vtkRenderWindow.newInstance();
    this.glWindow = vtkOpenGLRenderWindow.newInstance();
    this.interactor = vtkRenderWindowInteractor.newInstance();
    this.interactorStyle = vtkInteractorStyleTrackballCamera.newInstance();

    this.renderWindow.addRenderer(this.renderer);
    this.renderWindow.addView(this.glWindow);
    this.glWindow.setContainer(container);

    this.interactor.setView(this.glWindow);
    this.interactor.initialize();
    this.interactor.setInteractorStyle(this.interactorStyle);
    this.interactor.bindEvents(container);

    this.setupPerformanceMonitoring();
    this.setupInteractionHandlers();
  }

  setupPerformanceMonitoring() {
    setInterval(() => {
      this.fps = this.frameCount;
      this.frameCount = 0;
      
      if (this.fps < 15 && this.qualityMode === 'high') {
        this.setQualityMode('balanced');
      }
    }, 1000);

    this.renderWindow.getInteractor().onAnimation(() => {
      this.frameCount++;
    });
  }

  setupInteractionHandlers() {
    let isInteracting = false;
    
    this.interactor.onStartInteractionEvent(() => {
      isInteracting = true;
      this.setInteractiveQuality();
    });

    this.interactor.onEndInteractionEvent(() => {
      isInteracting = false;
      setTimeout(() => {
        if (!isInteracting) {
          this.restoreQuality();
        }
      }, 200);
    });
  }

  setInteractiveQuality() {
    this.actors.forEach(actor => {
      const prop = actor.getProperty();
      prop.setRepresentationToPoints();
      prop.setPointSize(2);
    });
    this.renderWindow.render();
  }

  restoreQuality() {
    this.actors.forEach((actor, key) => {
      const rep = this.actorRepresentations?.get(key) || 'surface';
      const prop = actor.getProperty();
      
      if (rep === 'wireframe') {
        prop.setRepresentationToWireframe();
      } else if (rep === 'points') {
        prop.setRepresentationToPoints();
        prop.setPointSize(3);
      } else {
        prop.setRepresentationToSurface();
      }
    });
    this.renderWindow.render();
  }

  setQualityMode(mode) {
    this.qualityMode = mode;
    
    const qualitySettings = {
      high: {
        edgeVisibility: true,
        pointSize: 3,
        scalarVisibility: true
      },
      balanced: {
        edgeVisibility: false,
        pointSize: 2,
        scalarVisibility: true
      },
      performance: {
        edgeVisibility: false,
        pointSize: 1,
        scalarVisibility: false
      }
    };

    const settings = qualitySettings[mode] || qualitySettings.balanced;
    
    this.actors.forEach(actor => {
      const prop = actor.getProperty();
      prop.setEdgeVisibility(settings.edgeVisibility);
      prop.setPointSize(settings.pointSize);
    });

    this.mappers.forEach(mapper => {
      mapper.setScalarVisibility(settings.scalarVisibility);
    });

    this.renderWindow.render();
  }

  createPolyDataFromProcessed(processedData) {
    const { points: flatPoints, polys } = processedData;
    
    const vtkPoints = vtkPoints.newInstance();
    vtkPoints.setData(flatPoints, 3);

    const vtkPolys = vtkCellArray.newInstance();
    vtkPolys.setData(polys);

    const polyData = vtkPolyData.newInstance();
    polyData.setPoints(vtkPoints);
    polyData.setPolys(vtkPolys);

    return polyData;
  }

  addGeometry(processedData, id = 'main', options = {}) {
    const {
      representation = 'surface',
      color = [0.5, 0.7, 0.9],
      edgeColor = [0.3, 0.3, 0.3],
      opacity = 1.0,
      showEdges = false
    } = options;

    const existingPolyData = this.polyDatas.get(id);
    if (existingPolyData) {
      existingPolyData.getPoints().delete();
      existingPolyData.getPolys().delete();
      existingPolyData.delete();
    }

    const existingActor = this.actors.get(id);
    if (existingActor) {
      this.renderer.removeActor(existingActor);
      existingActor.getMapper().delete();
      existingActor.delete();
    }

    const polyData = this.createPolyDataFromProcessed(processedData);
    this.polyDatas.set(id, polyData);

    const mapper = vtkPolyDataMapper.newInstance();
    mapper.setInputData(polyData);
    mapper.setScalarVisibility(false);
    this.mappers.set(id, mapper);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    const prop = actor.getProperty();
    prop.setColor(...color);
    prop.setEdgeColor(...edgeColor);
    prop.setEdgeVisibility(showEdges);
    prop.setOpacity(opacity);
    
    if (representation === 'wireframe') {
      prop.setRepresentationToWireframe();
    } else if (representation === 'points') {
      prop.setRepresentationToPoints();
      prop.setPointSize(3);
    } else {
      prop.setRepresentationToSurface();
    }

    this.renderer.addActor(actor);
    this.actors.set(id, actor);
    
    if (!this.actorRepresentations) {
      this.actorRepresentations = new Map();
    }
    this.actorRepresentations.set(id, representation);

    this.stats.totalCells += processedData.nPoints;
    this.stats.totalPoints += processedData.nPoints;
    
    this.checkMemoryAndWarn(processedData);

    return { actor, mapper, polyData };
  }

  addFieldData(fieldData, id = 'main', range = null) {
    const polyData = this.polyDatas.get(id);
    if (!polyData) return;

    const dataArray = vtkDataArray.newInstance({
      numberOfComponents: fieldData.nComponents || 1,
      values: fieldData.data,
      name: fieldData.fieldName || 'scalars'
    });

    polyData.getPointData().setScalars(dataArray);

    const mapper = this.mappers.get(id);
    if (mapper) {
      mapper.setScalarVisibility(true);
      
      const lut = vtkLookupTable.newInstance();
      lut.setHueRange(0.667, 0.0);
      lut.setSaturationRange(1.0, 1.0);
      lut.setValueRange(0.8, 1.0);
      lut.setRange(range || fieldData.range || [0, 1]);
      lut.build();
      
      mapper.setLookupTable(lut);
      mapper.setUseLookupTableScalarRange(true);
    }

    this.renderWindow.render();
  }

  removeActor(id) {
    const actor = this.actors.get(id);
    if (actor) {
      this.renderer.removeActor(actor);
      actor.getMapper().delete();
      actor.delete();
      this.actors.delete(id);
    }

    const mapper = this.mappers.get(id);
    if (mapper) {
      mapper.delete();
      this.mappers.delete(id);
    }

    const polyData = this.polyDatas.get(id);
    if (polyData) {
      polyData.getPoints()?.delete();
      polyData.getPolys()?.delete();
      polyData.delete();
      this.polyDatas.delete(id);
    }

    this.renderWindow.render();
  }

  checkMemoryAndWarn(processedData) {
    const pointsMB = processedData.points.byteLength / (1024 * 1024);
    const polysMB = processedData.polys.byteLength / (1024 * 1024);
    const totalMB = pointsMB + polysMB;

    this.stats.memoryMB += totalMB;

    if (processedData.nFaces > MAX_CELLS_CRITICAL) {
      console.warn(
        `[VTK] Critical: ${processedData.nFaces.toLocaleString()} cells. ` +
        `Consider using LOD or chunked loading. Memory: ${totalMB.toFixed(1)} MB`
      );
    } else if (processedData.nFaces > MAX_CELLS_WARNING) {
      console.warn(
        `[VTK] Warning: ${processedData.nFaces.toLocaleString()} cells. ` +
        `Performance may be affected. Memory: ${totalMB.toFixed(1)} MB`
      );
    }
  }

  createSlice(plane, id = 'main') {
    const polyData = this.polyDatas.get(id);
    if (!polyData) return null;

    const vtkPlane = vtkPlane.newInstance();
    vtkPlane.setOrigin(plane.origin);
    vtkPlane.setNormal(plane.normal);

    const cutter = vtkCutter.newInstance();
    cutter.setCutFunction(vtkPlane);
    cutter.setInputData(polyData);

    const mapper = vtkPolyDataMapper.newInstance();
    mapper.setInputConnection(cutter.getOutputPort());

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(1, 0.8, 0.6);
    actor.getProperty().setRepresentationToSurface();

    this.renderer.addActor(actor);
    this.actors.set('slice', actor);
    this.mappers.set('slice', mapper);

    return { cutter, mapper, actor };
  }

  createIsoSurface(value, fieldName, id = 'main') {
    const polyData = this.polyDatas.get(id);
    if (!polyData) return null;

    const contour = vtkContourFilter.newInstance();
    contour.setValue(0, value);
    contour.setInputData(polyData);

    const mapper = vtkPolyDataMapper.newInstance();
    mapper.setInputConnection(contour.getOutputPort());
    mapper.setScalarVisibility(true);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(0.9, 0.5, 0.5);
    actor.getProperty().setRepresentationToSurface();

    this.renderer.addActor(actor);
    this.actors.set('iso', actor);
    this.mappers.set('iso', mapper);

    return { contour, mapper, actor };
  }

  removeSlice() {
    this.removeActor('slice');
  }

  removeIsoSurface() {
    this.removeActor('iso');
  }

  resetCamera() {
    if (this.renderer) {
      this.renderer.resetCamera();
      this.renderWindow.render();
    }
  }

  render() {
    if (this.renderWindow) {
      this.renderWindow.render();
    }
  }

  getStats() {
    return {
      ...this.stats,
      fps: this.fps,
      qualityMode: this.qualityMode,
      nActors: this.actors.size
    };
  }

  dispose() {
    this.actors.forEach((actor, id) => {
      this.removeActor(id);
    });

    if (this.interactor) {
      this.interactor.unbindEvents();
    }

    if (this.glWindow && this.container) {
      this.glWindow.setContainer(null);
    }

    if (this.renderWindow) {
      if (this.renderer) {
        this.renderWindow.removeRenderer(this.renderer);
      }
      this.renderWindow.removeView(this.glWindow);
    }

    this.renderer?.delete();
    this.renderWindow?.delete();
    this.glWindow?.delete();
    this.interactor?.delete();
    this.interactorStyle?.delete();

    this.renderer = null;
    this.renderWindow = null;
    this.glWindow = null;
    this.interactor = null;
    this.interactorStyle = null;
    this.container = null;

    this.actors.clear();
    this.mappers.clear();
    this.polyDatas.clear();
  }
}

export default VtkRendererService;
