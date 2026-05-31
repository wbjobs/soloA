class OrbitControls {
    constructor(renderer) {
        this.renderer = renderer;
        this.canvas = renderer.canvas;
        this.camera = renderer.camera;
        
        this.target = new THREE.Vector3(0, 0, 0);
        
        this.isDragging = false;
        this.isPanning = false;
        this.previousMousePosition = { x: 0, y: 0 };
        
        this.rotateSpeed = 0.005;
        this.zoomSpeed = 0.1;
        this.panSpeed = 0.1;
        
        this._bindEvents();
    }

    _bindEvents() {
        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    }

    _onMouseDown(event) {
        this.previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };

        if (event.button === 0) {
            this.isDragging = true;
        } else if (event.button === 2) {
            this.isPanning = true;
        }
    }

    _onMouseMove(event) {
        const deltaMove = {
            x: event.clientX - this.previousMousePosition.x,
            y: event.clientY - this.previousMousePosition.y
        };

        if (this.isDragging) {
            this._rotate(deltaMove);
        } else if (this.isPanning) {
            this._pan(deltaMove);
        }

        this.previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    }

    _onMouseUp(event) {
        this.isDragging = false;
        this.isPanning = false;
    }

    _onWheel(event) {
        event.preventDefault();
        const delta = event.deltaY;
        this._zoom(delta);
    }

    _rotate(deltaMove) {
        const spherical = this._cameraToSpherical();
        
        spherical.theta -= deltaMove.x * this.rotateSpeed;
        spherical.phi -= deltaMove.y * this.rotateSpeed;
        
        const EPS = 0.000001;
        spherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, spherical.phi));
        
        this._sphericalToCamera(spherical);
    }

    _zoom(delta) {
        const spherical = this._cameraToSpherical();
        
        const zoomFactor = 1 + (delta > 0 ? this.zoomSpeed : -this.zoomSpeed);
        spherical.radius *= zoomFactor;
        
        spherical.radius = Math.max(1, Math.min(10000, spherical.radius));
        
        this._sphericalToCamera(spherical);
    }

    _pan(deltaMove) {
        const panDistance = this.panSpeed;
        
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        
        const right = new THREE.Vector3();
        right.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));
        right.normalize();
        
        const up = new THREE.Vector3();
        up.crossVectors(right, cameraDirection);
        up.normalize();
        
        const panX = -deltaMove.x * panDistance;
        const panY = deltaMove.y * panDistance;
        
        const panVector = new THREE.Vector3();
        panVector.addScaledVector(right, panX);
        panVector.addScaledVector(up, panY);
        
        this.camera.position.add(panVector);
        this.target.add(panVector);
        
        this.camera.lookAt(this.target);
    }

    _cameraToSpherical() {
        const offset = new THREE.Vector3().subVectors(this.camera.position, this.target);
        
        const spherical = {};
        spherical.radius = offset.length();
        spherical.theta = Math.atan2(offset.x, offset.z);
        spherical.phi = Math.acos(Math.max(-1, Math.min(1, offset.y / spherical.radius)));
        
        return spherical;
    }

    _sphericalToCamera(spherical) {
        const offset = new THREE.Vector3(
            spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
            spherical.radius * Math.cos(spherical.phi),
            spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta)
        );
        
        this.camera.position.copy(this.target).add(offset);
        this.camera.lookAt(this.target);
    }

    setTarget(x, y, z) {
        this.target.set(x, y, z);
        this.camera.lookAt(this.target);
    }

    reset() {
        this.target.set(0, 0, 0);
        this.camera.position.set(50, 50, 50);
        this.camera.lookAt(this.target);
    }
}
