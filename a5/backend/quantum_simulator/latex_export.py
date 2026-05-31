from typing import Dict, List, Any
import copy


GATE_LATEX_QCIRCUIT = {
    'H': r'\gate{H}',
    'X': r'\gate{X}',
    'Y': r'\gate{Y}',
    'Z': r'\gate{Z}',
    'S': r'\gate{S}',
    'T': r'\gate{T}',
    'I': r'\gate{I}',
}

GATE_LATEX_QUANTIKZ = {
    'H': r'\gate{H}',
    'X': r'\gate{X}',
    'Y': r'\gate{Y}',
    'Z': r'\gate{Z}',
    'S': r'\gate{S}',
    'T': r'\gate{T}',
    'I': r'\gate{I}',
}


def generate_qcircuit(gates: List[Dict[str, Any]], n_qubits: int, include_preamble: bool = True) -> str:
    lines = []
    
    if include_preamble:
        lines.append(r'\documentclass{article}')
        lines.append(r'\usepackage[braket, qm]{qcircuit}')
        lines.append(r'\usepackage{amsmath}')
        lines.append(r'\begin{document}')
        lines.append('')
    
    qubit_labels = [f'q{i}' for i in range(n_qubits)]
    
    max_steps = 0
    for gate in gates:
        gate_steps = max(gate['targets']) + 1 if gate['targets'] else 1
        max_steps = max(max_steps, gate_steps)
    
    circuit_rows = []
    for i in range(n_qubits):
        circuit_rows.append([f'\\lstick{{\\ket{{0}}}}'])
    
    for gate in gates:
        gate_type = gate['type']
        targets = gate['targets']
        
        row_content = [''] * n_qubits
        
        if gate_type == 'CNOT':
            control = targets[0]
            target = targets[1]
            
            min_q = min(control, target)
            max_q = max(control, target)
            
            for q in range(n_qubits):
                if q == control:
                    row_content[q] = r'\ctrl{' + str(target - control) + r'}'
                elif q == target:
                    row_content[q] = r'\targ'
                elif min_q < q < max_q:
                    row_content[q] = r'\qw'
                else:
                    row_content[q] = r'\qw'
        
        elif gate_type == 'TOFFOLI':
            control1 = targets[0]
            control2 = targets[1]
            target = targets[2]
            
            all_qubits = sorted([control1, control2, target])
            min_q = all_qubits[0]
            max_q = all_qubits[-1]
            
            for q in range(n_qubits):
                if q == control1 or q == control2:
                    row_content[q] = r'\ctrl{' + str(target - q) + r'}'
                elif q == target:
                    row_content[q] = r'\targ'
                elif min_q < q < max_q:
                    row_content[q] = r'\qw'
                else:
                    row_content[q] = r'\qw'
        
        elif gate_type in ['Rx', 'Ry', 'Rz']:
            target = targets[0]
            angle = gate.get('params', {}).get('angle', 0)
            
            for q in range(n_qubits):
                if q == target:
                    angle_str = f'{angle:.2f}'
                    row_content[q] = r'\gate{' + gate_type + r'(' + angle_str + r')}'
                else:
                    row_content[q] = r'\qw'
        
        elif gate_type in GATE_LATEX_QCIRCUIT:
            target = targets[0]
            
            for q in range(n_qubits):
                if q == target:
                    row_content[q] = GATE_LATEX_QCIRCUIT[gate_type]
                else:
                    row_content[q] = r'\qw'
        
        else:
            for q in range(n_qubits):
                row_content[q] = r'\qw'
        
        for q in range(n_qubits):
            circuit_rows[q].append(row_content[q])
    
    for q in range(n_qubits):
        circuit_rows[q].append(r'\qwa')
    
    lines.append(r'\begin{equation*}')
    lines.append(r'\Qcircuit @C=1em @R=.7em {')
    
    for q, row in enumerate(circuit_rows):
        line = '  '
        for j, cell in enumerate(row):
            if j > 0:
                line += ' & '
            line += cell
        line += r' \\'
        lines.append(line)
    
    lines.append(r'}')
    lines.append(r'\end{equation*}')
    
    if include_preamble:
        lines.append('')
        lines.append(r'\end{document}')
    
    return '\n'.join(lines)


def generate_quantikz(gates: List[Dict[str, Any]], n_qubits: int, include_preamble: bool = True) -> str:
    lines = []
    
    if include_preamble:
        lines.append(r'\documentclass{article}')
        lines.append(r'\usepackage{tikz}')
        lines.append(r'\usepackage{quantikz}')
        lines.append(r'\begin{document}')
        lines.append('')
    
    lines.append(r'\begin{quantikz}')
    
    row_strings = [[] for _ in range(n_qubits)]
    
    for gate in gates:
        gate_type = gate['type']
        targets = gate['targets']
        
        cell_content = [''] * n_qubits
        
        if gate_type == 'CNOT':
            control = targets[0]
            target = targets[1]
            
            min_q = min(control, target)
            max_q = max(control, target)
            
            for q in range(n_qubits):
                if q == control:
                    cell_content[q] = r'\ctrl{' + str(target - control) + r'}'
                elif q == target:
                    cell_content[q] = r'\targ{}'
                elif min_q < q < max_q:
                    cell_content[q] = r'\qw'
                else:
                    cell_content[q] = r'\qw'
        
        elif gate_type == 'TOFFOLI':
            control1 = targets[0]
            control2 = targets[1]
            target = targets[2]
            
            for q in range(n_qubits):
                if q == control1:
                    cell_content[q] = r'\ctrl{' + str(target - q) + r'}'
                elif q == control2:
                    cell_content[q] = r'\ctrl{' + str(target - q) + r'}'
                elif q == target:
                    cell_content[q] = r'\targ{}'
                else:
                    cell_content[q] = r'\qw'
        
        elif gate_type in ['Rx', 'Ry', 'Rz']:
            target = targets[0]
            angle = gate.get('params', {}).get('angle', 0)
            
            for q in range(n_qubits):
                if q == target:
                    angle_str = f'{angle:.2f}'
                    cell_content[q] = r'\gate{' + gate_type + r'(' + angle_str + r')}'
                else:
                    cell_content[q] = r'\qw'
        
        elif gate_type in GATE_LATEX_QUANTIKZ:
            target = targets[0]
            
            for q in range(n_qubits):
                if q == target:
                    cell_content[q] = GATE_LATEX_QUANTIKZ[gate_type]
                else:
                    cell_content[q] = r'\qw'
        
        else:
            for q in range(n_qubits):
                cell_content[q] = r'\qw'
        
        for q in range(n_qubits):
            row_strings[q].append(cell_content[q])
    
    for q in range(n_qubits):
        row_strings[q].insert(0, r'\lstick{$\ket{0}$}')
    
    for q, row in enumerate(row_strings):
        line = '  ' + ' & '.join(row) + r' \\'
        lines.append(line)
    
    lines.append(r'\end{quantikz}')
    
    if include_preamble:
        lines.append('')
        lines.append(r'\end{document}')
    
    return '\n'.join(lines)


def generate_latex(gates: List[Dict[str, Any]], n_qubits: int, 
                   package: str = 'qcircuit', include_preamble: bool = True) -> str:
    if package == 'qcircuit':
        return generate_qcircuit(gates, n_qubits, include_preamble)
    elif package == 'quantikz':
        return generate_quantikz(gates, n_qubits, include_preamble)
    else:
        raise ValueError(f"Unknown LaTeX package: {package}")


def generate_latex_both(gates: List[Dict[str, Any]], n_qubits: int) -> Dict[str, str]:
    return {
        'qcircuit': generate_latex(gates, n_qubits, 'qcircuit', include_preamble=True),
        'qcircuit_snippet': generate_latex(gates, n_qubits, 'qcircuit', include_preamble=False),
        'quantikz': generate_latex(gates, n_qubits, 'quantikz', include_preamble=True),
        'quantikz_snippet': generate_latex(gates, n_qubits, 'quantikz', include_preamble=False),
    }
