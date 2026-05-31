import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import vtkScalarBarActor from '@kitware/vtk.js/Rendering/Core/ScalarBarActor';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkCutter from '@kitware/vtk.js/Filters/Core/Cutter';
import vtkContourFilter from '@kitware/vtk.js/Filters/General/ContourFilter';

const VtkViewer = ({ geometry, fieldData, fieldName, viewMode, slice, isoSurface, representation }) => {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const renderWindowRef = useRef(null);
  const mapperRef = useRef(null);
  const actorRef = useRef(null);
  const sliceMapperRef = useRef(null);
  const sliceActorRef = useRef(null);
  const isoMapperRef = useRef(null);
  const isoActorRef = useRef(null);

  const createLookupTable = useCallback(() => {
    const lut = vtkLookupTable.newInstance();
    lut.setHueRange(0.667, 0.0);
    lut.setSaturationRange(1.0, 1.0);
    lut.setValueRange(0.8, 1.0);
    lut.setRange(fieldData?.statistics?.[fieldName]?.min || 0, fieldData?.statistics?.[fieldName]?.max || 1);
    lut.build();
    return lut;
  }, [fieldData, fieldName]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const renderer = vtkRenderer.newInstance({ background: [0.1, 0.1, 0.15] });
    const renderWindow = vtkRenderWindow.newInstance();
    const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
    const interactor = vtkRenderWindowInteractor.newInstance();
    const interactorStyle = vtkInteractorStyleTrackballCamera.newInstance();

    renderWindow.addRenderer(renderer);
    renderWindow.addView(openGLRenderWindow);
    openGLRenderWindow.setContainer(container);

    interactor.setView(openGLRenderWindow);
    interactor.initialize();
    interactor.setInteractorStyle(interactorStyle);
    interactor.bindEvents(container);

    rendererRef.current = renderer;
    renderWindowRef.current = renderWindow;

    const axes = document.createElement('div');
    axes.style.position = 'absolute';
    axes.style.bottom = '10px';
    axes.style.left = '10px';
    axes.style.width = '80px';
    axes.style.height = '80px';
    container.appendChild(axes);

    return () => {
      interactor.unbindEvents();
      openGLRenderWindow.setContainer(null);
      renderWindow.removeRenderer(renderer);
      renderWindow.removeView(openGLRenderWindow);
      renderer.delete();
      renderWindow.delete();
      openGLRenderWindow.delete();
      interactor.delete();
      interactorStyle.delete();
    };
  }, []);

  useEffect(() => {
    if (!rendererRef.current || !geometry?.points?.length) return;

    const renderer = rendererRef.current;
    const renderWindow = renderWindowRef.current;

    if (actorRef.current) {
      renderer.removeActor(actorRef.current);
    }

    const points = vtkPoints.newInstance();
    points.setNumberOfPoints(geometry.points.length);
    geometry.points.forEach((pt, i) => {
      points.setPoint(i, pt[0], pt[1], pt[2]);
    });

    const polys = vtkCellArray.newInstance();
    geometry.faces.forEach(face => {
      polys.insertNextCell([face.length, ...face]);
    });

    const polyData = vtkPolyData.newInstance();
    polyData.setPoints(points);
    polyData.setPolys(polys);

    if (fieldData?.data?.length) {
      const dataArray = vtkDataArray.newInstance({
        numberOfComponents: fieldData.data[0].length || 1,
        values: fieldData.data.flat(),
        name: fieldName || 'scalars',
      });
      polyData.getPointData().setScalars(dataArray);
    }

    const mapper = vtkPolyDataMapper.newInstance();
    mapper.setInputData(polyData);
    mapper.setScalarVisibility(!!fieldData?.data?.length);

    if (fieldData?.data?.length) {
      const lut = createLookupTable();
      mapper.setLookupTable(lut);
      mapper.setUseLookupTableScalarRange(true);
    }

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    const property = actor.getProperty();
    if (representation === 'points') {
      property.setRepresentationToPoints();
      property.setPointSize(3);
    } else if (representation === 'wireframe') {
      property.setRepresentationToWireframe();
    } else {
      property.setRepresentationToSurface();
    }
    property.setColor(0.5, 0.7, 0.9);
    property.setEdgeVisibility(viewMode === 'mesh');
    property.setEdgeColor(0.3, 0.3, 0.3);

    renderer.addActor(actor);
    mapperRef.current = mapper;
    actorRef.current = actor;

    renderer.resetCamera();
    renderWindow.render();
  }, [geometry, fieldData, fieldName, viewMode, representation, createLookupTable]);

  useEffect(() => {
    if (!rendererRef.current || !geometry?.points?.length || !fieldData?.data?.length) return;

    const renderer = rendererRef.current;
    const renderWindow = renderWindowRef.current;

    if (sliceActorRef.current) {
      renderer.removeActor(sliceActorRef.current);
    }

    if (!slice.enabled) {
      renderWindow?.render();
      return;
    }

    const axisIndex = { x: 0, y: 1, z: 2 }[slice.axis];
    const points = geometry.points;
    const minVal = Math.min(...points.map(p => p[axisIndex]));
    const maxVal = Math.max(...points.map(p => p[axisIndex]));
    const slicePos = minVal + slice.position * (maxVal - minVal);

    const normal = [0, 0, 0];
    normal[axisIndex] = 1;

    const plane = vtkPlane.newInstance();
    plane.setOrigin(slicePos * (1 - slice.position) > 0 ? slicePos : minVal + slice.position * (maxVal - minVal));
    plane.setNormal(normal);
    plane.setOrigin(
      normal[0] * slicePos || 0,
      normal[1] * slicePos || 0,
      normal[2] * slicePos || 0
    );

    const cutter = vtkCutter.newInstance();
    cutter.setCutFunction(plane);

    const vtkPointsData = vtkPoints.newInstance();
    vtkPointsData.setNumberOfPoints(geometry.points.length);
    geometry.points.forEach((pt, i) => {
      vtkPointsData.setPoint(i, pt[0], pt[1], pt[2]);
    });

    const vtkPolys = vtkCellArray.newInstance();
    geometry.faces.forEach(face => {
      vtkPolys.insertNextCell([face.length, ...face]);
    });

    const inputPolyData = vtkPolyData.newInstance();
    inputPolyData.setPoints(vtkPointsData);
    inputPolyData.setPolys(vtkPolys);

    if (fieldData?.data?.length) {
      const dataArray = vtkDataArray.newInstance({
        numberOfComponents: fieldData.data[0].length || 1,
        values: fieldData.data.flat(),
        name: fieldName || 'scalars',
      });
      inputPolyData.getPointData().setScalars(dataArray);
    }

    cutter.setInputData(inputPolyData);

    const sliceMapper = vtkPolyDataMapper.newInstance();
    sliceMapper.setInputConnection(cutter.getOutputPort());
    sliceMapper.setScalarVisibility(!!fieldData?.data?.length);

    if (fieldData?.data?.length) {
      const lut = createLookupTable();
      sliceMapper.setLookupTable(lut);
      sliceMapper.setUseLookupTableScalarRange(true);
    }

    const sliceActor = vtkActor.newInstance();
    sliceActor.setMapper(sliceMapper);
    sliceActor.getProperty().setColor(1, 0.8, 0.6);

    renderer.addActor(sliceActor);
    sliceMapperRef.current = sliceMapper;
    sliceActorRef.current = sliceActor;

    renderWindow?.render();
  }, [slice, geometry, fieldData, fieldName, createLookupTable]);

  useEffect(() => {
    if (!rendererRef.current || !geometry?.points?.length || !fieldData?.data?.length) return;

    const renderer = rendererRef.current;
    const renderWindow = renderWindowRef.current;

    if (isoActorRef.current) {
      renderer.removeActor(isoActorRef.current);
    }

    if (!isoSurface.enabled) {
      renderWindow?.render();
      return;
    }

    const stats = fieldData?.statistics?.[fieldName];
    if (!stats) {
      renderWindow?.render();
      return;
    }

    const isoValue = stats.min + isoSurface.value * (stats.max - stats.min);

    const contour = vtkContourFilter.newInstance();
    contour.setValue(0, isoValue);

    const vtkPointsData = vtkPoints.newInstance();
    vtkPointsData.setNumberOfPoints(geometry.points.length);
    geometry.points.forEach((pt, i) => {
      vtkPointsData.setPoint(i, pt[0], pt[1], pt[2]);
    });

    const vtkPolys = vtkCellArray.newInstance();
    geometry.faces.forEach(face => {
      vtkPolys.insertNextCell([face.length, ...face]);
    });

    const inputPolyData = vtkPolyData.newInstance();
    inputPolyData.setPoints(vtkPointsData);
    inputPolyData.setPolys(vtkPolys);

    if (fieldData?.data?.length) {
      const dataArray = vtkDataArray.newInstance({
        numberOfComponents: fieldData.data[0].length || 1,
        values: fieldData.data.flat(),
        name: fieldName || 'scalars',
      });
      inputPolyData.getPointData().setScalars(dataArray);
    }

    contour.setInputData(inputPolyData);

    const isoMapper = vtkPolyDataMapper.newInstance();
    isoMapper.setInputConnection(contour.getOutputPort());
    isoMapper.setScalarVisibility(true);

    if (fieldData?.data?.length) {
      const lut = createLookupTable();
      isoMapper.setLookupTable(lut);
      isoMapper.setUseLookupTableScalarRange(true);
    }

    const isoActor = vtkActor.newInstance();
    isoActor.setMapper(isoMapper);
    isoActor.getProperty().setColor(0.9, 0.5, 0.5);
    isoActor.getProperty().setRepresentationToSurface();

    renderer.addActor(isoActor);
    isoMapperRef.current = isoMapper;
    isoActorRef.current = isoActor;

    renderWindow?.render();
  }, [isoSurface, geometry, fieldData, fieldName, createLookupTable]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
  );
};

export default VtkViewer;
