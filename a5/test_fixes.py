# -*- coding: utf-8 -*-
import numpy as np
import warnings
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from backend.quantum_simulator import QuantumCircuitSimulator
from backend.quantum_simulator.gates import CNOT, Toffoli

print('='*60)
print('  Comprehensive Quantum Circuit Simulator Tests')
print('='*60)
print()

all_passed = True

# Test 1: Basic quantum gates
print('[1/8] Testing basic quantum gates...')
s = QuantumCircuitSimulator(2)
s.apply_gate('X', [0])
s.apply_gate('X', [1])
r = s.get_results()
if r['probabilities']['11'] > 0.99:
    print('  [PASS] X gate: |11> correct')
else:
    print('  [FAIL] X gate failed')
    all_passed = False

# Test 2: Bell state
print()
print('[2/8] Testing Bell state...')
s = QuantumCircuitSimulator(2)
s.apply_gate('H', [0])
s.apply_gate('CNOT', [0, 1])
r = s.get_results()
prob_sum = sum(r['probabilities'].values())
if abs(r['probabilities']['00'] - 0.5) < 0.01 and abs(r['probabilities']['11'] - 0.5) < 0.01:
    print('  [PASS] Bell state: |00> and |11> each 50%')
else:
    print('  [FAIL] Bell state failed')
    print('    Actual: |00>={:.4f}, |11>={:.4f}'.format(r['probabilities']['00'], r['probabilities']['11']))
    all_passed = False
if abs(prob_sum - 1.0) < 1e-10:
    print('  [PASS] Probability sum = 1.0')
else:
    print('  [FAIL] Probability sum =', prob_sum)
    all_passed = False

# Test 3: H*H = I
print()
print('[3/8] Testing H*H = I...')
s = QuantumCircuitSimulator(1)
s.apply_gate('H', [0])
s.apply_gate('H', [0])
r = s.get_results()
prob_sum = sum(r['probabilities'].values())
if abs(r['probabilities']['0'] - 1.0) < 1e-6:
    print('  [PASS] H*H returns to |0>')
else:
    print('  [FAIL] H*H failed: |0>={:.10f}'.format(r['probabilities']['0']))
    all_passed = False
if abs(prob_sum - 1.0) < 1e-10:
    print('  [PASS] Probability sum = 1.0')
else:
    print('  [FAIL] Probability sum =', prob_sum)
    all_passed = False

# Test 4: CNOT matrix unitarity
print()
print('[4/8] Testing CNOT matrix unitarity...')
cnot = CNOT(0, 1, 2)
identity = cnot @ cnot.conj().T
if np.allclose(identity, np.eye(4)):
    print('  [PASS] CNOT is unitary')
else:
    print('  [FAIL] CNOT is not unitary')
    all_passed = False

# Test 5: Toffoli gate
print()
print('[5/8] Testing Toffoli gate...')
toffoli = Toffoli(0, 1, 2, 3)
identity = toffoli @ toffoli.conj().T
if np.allclose(identity, np.eye(8)):
    print('  [PASS] Toffoli is unitary')
else:
    print('  [FAIL] Toffoli is not unitary')
    all_passed = False

# Test: Toffoli functionality
s = QuantumCircuitSimulator(3)
s.apply_gate('X', [0])
s.apply_gate('X', [1])
s.apply_gate('TOFFOLI', [0, 1, 2])
r = s.get_results()
if r['probabilities']['111'] > 0.99:
    print('  [PASS] Toffoli: |110> -> |111>')
else:
    print('  [FAIL] Toffoli failed')
    all_passed = False

# Test 6: Bloch sphere coordinates (no divide by zero warning)
print()
print('[6/8] Testing Bloch sphere coordinates...')
with warnings.catch_warnings(record=True) as w:
    warnings.simplefilter('always')
    s = QuantumCircuitSimulator(1)
    s.apply_gate('X', [0])  # |1> state
    r = s.get_results()
    
    if len(w) == 0:
        print('  [PASS] No divide-by-zero warnings')
    else:
        for warning in w:
            print('  [WARNING]:', warning.message)
        all_passed = False
    
    if abs(r['bloch_spheres']['q0']['z'] + 1.0) < 0.01:
        print('  [PASS] |1> state Bloch sphere z = -1')
    else:
        print('  [FAIL] |1> state z = {:.4f} (expected -1)'.format(r['bloch_spheres']['q0']['z']))
        all_passed = False

# Test 7: GHZ state
print()
print('[7/8] Testing GHZ state...')
s = QuantumCircuitSimulator(3)
s.apply_gate('H', [0])
s.apply_gate('CNOT', [0, 1])
s.apply_gate('CNOT', [0, 2])
r = s.get_results()
prob_sum = sum(r['probabilities'].values())
if abs(r['probabilities']['000'] - 0.5) < 0.01 and abs(r['probabilities']['111'] - 0.5) < 0.01:
    print('  [PASS] GHZ state: |000> and |111> each 50%')
else:
    print('  [FAIL] GHZ state failed')
    all_passed = False
if abs(prob_sum - 1.0) < 1e-10:
    print('  [PASS] Probability sum = 1.0')
else:
    print('  [FAIL] Probability sum =', prob_sum)
    all_passed = False

# Test 8: Multi-qubit CNOT
print()
print('[8/8] Testing multi-qubit CNOT...')
s = QuantumCircuitSimulator(4)
s.apply_gate('X', [0])  # |1000>
s.apply_gate('CNOT', [0, 3])  # flip q3
r = s.get_results()
if r['probabilities']['1001'] > 0.99:
    print('  [PASS] CNOT(0,3): |1000> -> |1001>')
else:
    print('  [FAIL] CNOT(0,3) failed')
    all_passed = False

print()
print('='*60)
if all_passed:
    print('  ALL TESTS PASSED!')
else:
    print('  SOME TESTS FAILED')
print('='*60)
