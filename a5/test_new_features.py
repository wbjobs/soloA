# -*- coding: utf-8 -*-
import numpy as np
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from backend.quantum_simulator import (
    QuantumCircuitSimulator,
    get_optimization_suggestions,
    optimize_circuit,
    generate_latex_both
)

print('='*70)
print('  Testing New Features: Circuit Optimization & LaTeX Export')
print('='*70)
print()

all_passed = True

# Test 1: Optimization - Remove Identity Gates
print('[1/6] Testing: Remove Identity Gates...')
gates_with_I = [
    {'type': 'I', 'targets': [0], 'params': {}},
    {'type': 'H', 'targets': [0], 'params': {}},
    {'type': 'I', 'targets': [1], 'params': {}},
    {'type': 'CNOT', 'targets': [0, 1], 'params': {}},
]

result = optimize_circuit(gates_with_I, 2)
print(f'  Original gates: {len(gates_with_I)}')
print(f'  Optimized gates: {result["optimized_count"]}')
print(f'  Gates removed: {result["gates_removed"]}')

if result["optimized_count"] == 2:
    print('  [PASS] Correctly removed 2 identity gates')
else:
    print('  [FAIL] Expected 2 optimized gates')
    all_passed = False

print()

# Test 2: Optimization - Cancel Self-Inverse Pairs
print('[2/6] Testing: Cancel Self-Inverse Pairs (H*H, X*X, etc.)...')
gates_with_pairs = [
    {'type': 'H', 'targets': [0], 'params': {}},
    {'type': 'H', 'targets': [0], 'params': {}},
    {'type': 'X', 'targets': [1], 'params': {}},
    {'type': 'X', 'targets': [1], 'params': {}},
    {'type': 'CNOT', 'targets': [0, 1], 'params': {}},
    {'type': 'CNOT', 'targets': [0, 1], 'params': {}},
]

result = optimize_circuit(gates_with_pairs, 2)
print(f'  Original gates: {len(gates_with_pairs)}')
print(f'  Optimized gates: {result["optimized_count"]}')

if result["optimized_count"] == 0:
    print('  [PASS] Correctly cancelled all self-inverse pairs')
else:
    print('  [FAIL] Expected 0 optimized gates')
    all_passed = False

print()

# Test 3: Optimization - Merge Rotation Gates
print('[3/6] Testing: Merge Rotation Gates...')
gates_to_merge = [
    {'type': 'Rx', 'targets': [0], 'params': {'angle': np.pi/4}},
    {'type': 'Rx', 'targets': [0], 'params': {'angle': np.pi/4}},
]

result = get_optimization_suggestions(gates_to_merge, 1)
print(f'  Original gates: {result["summary"]["original_count"]}')
print(f'  Optimized gates: {result["summary"]["optimized_count"]}')
print(f'  Suggestions: {len(result["suggestions"])}')

if len(result["suggestions"]) > 0:
    print('  [PASS] Found merge suggestion')
else:
    print('  [FAIL] No merge suggestions found')
    all_passed = False

print()

# Test 4: Optimization - Verify Bell state is not incorrectly optimized
print('[4/6] Testing: Bell state should not be incorrectly optimized...')
bell_state_gates = [
    {'type': 'H', 'targets': [0], 'params': {}},
    {'type': 'CNOT', 'targets': [0, 1], 'params': {}},
]

result = optimize_circuit(bell_state_gates, 2)
print(f'  Original gates: {len(bell_state_gates)}')
print(f'  Optimized gates: {result["optimized_count"]}')

if result["optimized_count"] == 2:
    print('  [PASS] Bell state gates preserved correctly')
else:
    print('  [FAIL] Bell state should have 2 gates')
    all_passed = False

print()

# Test 5: LaTeX Export - Qcircuit
print('[5/6] Testing: LaTeX Export (Qcircuit)...')
bell_state_gates = [
    {'type': 'H', 'targets': [0], 'params': {}},
    {'type': 'CNOT', 'targets': [0, 1], 'params': {}},
]

latex_result = generate_latex_both(bell_state_gates, 2)
qcircuit = latex_result['qcircuit']

has_qcircuit = 'usepackage' in qcircuit and 'qcircuit' in qcircuit
has_gate_h = r'\gate{H}' in qcircuit
has_ctrl = r'\ctrl' in qcircuit or r'\targ' in qcircuit

print(f'  Has qcircuit package: {has_qcircuit}')
print(f'  Has H gate: {has_gate_h}')
print(f'  Has CNOT control/target: {has_ctrl}')

if has_qcircuit and has_gate_h and has_ctrl:
    print('  [PASS] Qcircuit export works correctly')
else:
    print('  [FAIL] Qcircuit export issues')
    all_passed = False

print()

# Test 6: LaTeX Export - quantikz
print('[6/6] Testing: LaTeX Export (quantikz)...')
quantikz = latex_result['quantikz']

has_quantikz = 'usepackage' in quantikz and 'quantikz' in quantikz
has_quantikz_env = r'\begin{quantikz}' in quantikz

print(f'  Has quantikz package: {has_quantikz}')
print(f'  Has quantikz environment: {has_quantikz_env}')

if has_quantikz and has_quantikz_env:
    print('  [PASS] quantikz export works correctly')
else:
    print('  [FAIL] quantikz export issues')
    all_passed = False

print()
print('='*70)
if all_passed:
    print('  ALL TESTS PASSED!')
else:
    print('  SOME TESTS FAILED')
print('='*70)

print()
print('Sample Qcircuit output snippet:')
print('-'*70)
snippet = latex_result['qcircuit_snippet']
lines = snippet.split('\n')
for line in lines[:15]:
    print(f'  {line}')
if len(lines) > 15:
    print('  ...')
print('-'*70)
