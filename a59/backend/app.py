from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import uuid
import json
import numpy as np
from werkzeug.utils import secure_filename

from modules.las_parser import LASParser
from modules.model_simplify import ModelSimplifier
from modules.cutting import CuttingEngine
from modules.contour import ContourCalculator

app = Flask(__name__, static_folder='../frontend')
CORS(app)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'las', 'laz'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

active_sessions = {}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        session_id = str(uuid.uuid4())
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_{filename}")
        file.save(file_path)
        
        parser = LASParser()
        if parser.load_las(file_path):
            data = parser.get_points_data(max_points=100000)
            bounding_box = parser.get_bounding_box()
            
            active_sessions[session_id] = {
                'file_path': file_path,
                'parser': parser,
                'data': data,
                'bounding_box': bounding_box
            }
            
            return jsonify({
                'success': True,
                'session_id': session_id,
                'data': data,
                'bounding_box': bounding_box
            })
        else:
            return jsonify({'error': 'Failed to parse LAS file'}), 500
    
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/api/simplify', methods=['POST'])
def simplify_model():
    data = request.json
    session_id = data.get('session_id')
    method = data.get('method', 'voxel')
    params = data.get('params', {})
    
    if session_id not in active_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = active_sessions[session_id]
    points = session['data']['points']
    colors = session['data']['colors']
    
    simplifier = ModelSimplifier()
    simplified_points, simplified_colors = simplifier.simplify(
        points, colors, method=method, **params
    )
    
    stats = simplifier.get_simplify_stats(points, simplified_points)
    
    simplified_data = {
        'points': simplified_points.tolist(),
        'colors': simplified_colors.tolist()
    }
    
    session['simplified_data'] = simplified_data
    session['simplify_stats'] = stats
    
    return jsonify({
        'success': True,
        'data': simplified_data,
        'stats': stats
    })

@app.route('/api/cut', methods=['POST'])
def perform_cut():
    data = request.json
    session_id = data.get('session_id')
    cut_type = data.get('cut_type', 'plane')
    plane_point = data.get('plane_point', [0, 0, 0])
    plane_normal = data.get('plane_normal', [0, 1, 0])
    tolerance = data.get('tolerance', 0.1)
    
    if session_id not in active_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = active_sessions[session_id]
    
    if 'simplified_data' in session:
        points = session['simplified_data']['points']
        colors = session['simplified_data']['colors']
    else:
        points = session['data']['points']
        colors = session['data']['colors']
    
    cutter = CuttingEngine()
    
    if cut_type == 'plane':
        result = cutter.plane_cut(points, colors, plane_point, plane_normal, tolerance)
    else:
        def surface_function(x, y):
            return np.zeros_like(x) + plane_point[2]
        result = cutter.surface_cut(points, colors, surface_function, tolerance)
    
    return jsonify({
        'success': True,
        'result': result
    })

@app.route('/api/cross-section', methods=['POST'])
def cross_section():
    data = request.json
    session_id = data.get('session_id')
    plane_point = data.get('plane_point', [0, 0, 0])
    plane_normal = data.get('plane_normal', [0, 1, 0])
    grid_size = data.get('grid_size', 100)
    
    if session_id not in active_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = active_sessions[session_id]
    
    if 'simplified_data' in session:
        points = session['simplified_data']['points']
        colors = session['simplified_data']['colors']
    else:
        points = session['data']['points']
        colors = session['data']['colors']
    
    cutter = CuttingEngine()
    section = cutter.generate_cross_section(points, colors, plane_point, plane_normal, grid_size)
    
    if section:
        session['last_cross_section'] = section
    
    return jsonify({
        'success': True,
        'section': section
    })

@app.route('/api/contours', methods=['POST'])
def calculate_contours():
    data = request.json
    session_id = data.get('session_id')
    grid_resolution = data.get('grid_resolution', 100)
    num_levels = data.get('num_levels', 10)
    smooth = data.get('smooth', True)
    smooth_sigma = data.get('smooth_sigma', 1.0)
    
    if session_id not in active_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = active_sessions[session_id]
    
    if 'simplified_data' in session:
        points = session['simplified_data']['points']
    else:
        points = session['data']['points']
    
    calculator = ContourCalculator()
    height_grid = calculator.create_height_grid(points, grid_resolution)
    
    if smooth:
        height_grid = calculator.smooth_grid(height_grid, sigma=smooth_sigma)
    
    contours = calculator.calculate_contours(height_grid, num_levels)
    contours = calculator.generate_contour_colors(contours)
    stats = calculator.get_contour_statistics(contours, height_grid['bounds'])
    
    session['contours'] = contours
    session['height_grid'] = height_grid
    
    return jsonify({
        'success': True,
        'contours': contours,
        'height_grid': height_grid,
        'stats': stats
    })

@app.route('/api/export', methods=['POST'])
def export_data():
    data = request.json
    session_id = data.get('session_id')
    export_type = data.get('type', 'json')
    
    if session_id not in active_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = active_sessions[session_id]
    
    export_data = {
        'metadata': session['data'].get('metadata', {}),
        'bounding_box': session.get('bounding_box', {}),
        'simplify_stats': session.get('simplify_stats', {})
    }
    
    export_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_export.json")
    
    with open(export_path, 'w') as f:
        json.dump(export_data, f, indent=2)
    
    return send_file(export_path, as_attachment=True, download_name='export.json')

@app.route('/api/session/<session_id>', methods=['GET'])
def get_session(session_id):
    if session_id not in active_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = active_sessions[session_id]
    
    return jsonify({
        'exists': True,
        'has_data': 'data' in session,
        'has_simplified': 'simplified_data' in session,
        'has_contours': 'contours' in session,
        'bounding_box': session.get('bounding_box')
    })

@app.route('/api/attributes/<session_id>', methods=['GET'])
def get_attributes(session_id):
    if session_id not in active_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = active_sessions[session_id]
    parser = session['parser']
    
    attributes = []
    for attr_name in parser.available_attributes:
        stats = parser.get_attribute_stats(attr_name)
        attributes.append(stats)
    
    return jsonify({
        'success': True,
        'attributes': attributes
    })

@app.route('/api/attribute-colors', methods=['POST'])
def get_attribute_colors():
    data = request.json
    session_id = data.get('session_id')
    attr_name = data.get('attr_name', 'elevation')
    colormap = data.get('colormap', 'viridis')
    invert = data.get('invert', False)
    
    if session_id not in active_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = active_sessions[session_id]
    parser = session['parser']
    
    if attr_name not in parser.available_attributes:
        return jsonify({'error': f'Attribute {attr_name} not found'}), 404
    
    color_data = parser.get_attribute_colors(attr_name, colormap, invert)
    
    if color_data is None:
        return jsonify({'error': 'Failed to generate attribute colors'}), 500
    
    sampled_indices = session['data'].get('sampled_indices')
    if sampled_indices is not None:
        sampled_colors = [color_data['colors'][i] for i in sampled_indices]
    else:
        sampled_colors = color_data['colors']
    
    return jsonify({
        'success': True,
        'colors': sampled_colors,
        'colormap': colormap,
        'attribute': attr_name,
        'min': color_data['min'],
        'max': color_data['max']
    })

@app.route('/api/reset-colors', methods=['POST'])
def reset_colors():
    data = request.json
    session_id = data.get('session_id')
    
    if session_id not in active_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = active_sessions[session_id]
    
    return jsonify({
        'success': True,
        'colors': session['data']['colors']
    })

if __name__ == '__main__':
    print("Starting 3D Geological Visualization Server...")
    app.run(host='0.0.0.0', port=5000, debug=True)
