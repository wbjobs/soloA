from typing import List, Dict, Tuple, Optional, Set
from dataclasses import dataclass, field
from difflib import SequenceMatcher
import json

@dataclass
class LineDiff:
    line_number: int
    operation: str
    content: str
    original_line_number: Optional[int] = None

@dataclass
class MergeResult:
    success: bool
    merged_content: str
    conflicts: List[str]
    ancestor_content: str
    branch_a_content: str
    branch_b_content: str
    resolved_conflicts: List[Tuple[int, str]]

@dataclass
class MergeHunk:
    start_ancestor: int
    start_a: int
    start_b: int
    end_ancestor: int
    end_a: int
    end_b: int
    lines_ancestor: List[str]
    lines_a: List[str]
    lines_b: List[str]
    is_conflict: bool = False

def tokenize(text: str) -> List[str]:
    return text.splitlines(keepends=True)

def reconstruct(lines: List[str]) -> str:
    return "".join(lines)

def diff_text(old_text: str, new_text: str) -> List[Dict]:
    sm = SequenceMatcher(None, old_text.splitlines(), new_text.splitlines())
    changes = []
    
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            continue
        changes.append({
            'operation': tag,
            'old_start': i1,
            'old_end': i2,
            'new_start': j1,
            'new_end': j2
        })
    
    return changes

def find_merge_base(history_a: List[str], history_b: List[str]) -> Optional[str]:
    set_b = set(h for h in history_b)
    for h in reversed(history_a):
        if h in set_b:
            return h
    return None

def _get_equal_regions(opcodes: List) -> Set[int]:
    equal_lines = set()
    for tag, i1, i2, j1, j2 in opcodes:
        if tag == 'equal':
            for i in range(i1, i2):
                equal_lines.add(i)
    return equal_lines

def three_way_merge(
    ancestor: str,
    branch_a: str,
    branch_b: str,
    conflict_marker_a: str = "<<<<<<< BRANCH_A",
    conflict_marker_b: str = "=======",
    conflict_marker_end: str = ">>>>>>> BRANCH_B",
    auto_resolve: bool = False
) -> MergeResult:
    ancestor_lines = tokenize(ancestor)
    a_lines = tokenize(branch_a)
    b_lines = tokenize(branch_b)
    
    sm_a = SequenceMatcher(None, ancestor_lines, a_lines)
    sm_b = SequenceMatcher(None, ancestor_lines, b_lines)
    
    ops_a = list(sm_a.get_opcodes())
    ops_b = list(sm_b.get_opcodes())
    
    equal_from_a = _get_equal_regions(ops_a)
    equal_from_b = _get_equal_regions(ops_b)
    
    merged_lines: List[str] = []
    conflicts: List[str] = []
    resolved_conflicts: List[Tuple[int, str]] = []
    conflict_counter = 0
    
    a_ptr = 0
    b_ptr = 0
    anc_ptr = 0
    
    op_a_idx = 0
    op_b_idx = 0
    
    while anc_ptr < len(ancestor_lines) or a_ptr < len(a_lines) or b_ptr < len(b_lines):
        if anc_ptr < len(ancestor_lines):
            a_op = None
            b_op = None
            
            if op_a_idx < len(ops_a):
                tag_a, ai1, ai2, aj1, aj2 = ops_a[op_a_idx]
                if anc_ptr >= ai1 and anc_ptr < ai2:
                    a_op = (tag_a, ai1, ai2, aj1, aj2)
            
            if op_b_idx < len(ops_b):
                tag_b, bi1, bi2, bj1, bj2 = ops_b[op_b_idx]
                if anc_ptr >= bi1 and anc_ptr < bi2:
                    b_op = (tag_b, bi1, bi2, bj1, bj2)
            
            a_equal = a_op and a_op[0] == 'equal'
            b_equal = b_op and b_op[0] == 'equal'
            
            if a_equal and b_equal:
                merged_lines.append(ancestor_lines[anc_ptr])
                anc_ptr += 1
                a_ptr += 1
                b_ptr += 1
                
                if a_op and anc_ptr >= a_op[2]:
                    op_a_idx += 1
                if b_op and anc_ptr >= b_op[2]:
                    op_b_idx += 1
                
                continue
            
            if a_equal and not b_equal:
                merged_lines.append(ancestor_lines[anc_ptr])
                anc_ptr += 1
                a_ptr += 1
                
                if a_op and anc_ptr >= a_op[2]:
                    op_a_idx += 1
                
                if b_op:
                    tag_b, _, bi2, _, bj2 = b_op
                    if tag_b == 'delete':
                        if anc_ptr >= bi2:
                            op_b_idx += 1
                continue
            
            if not a_equal and b_equal:
                merged_lines.append(ancestor_lines[anc_ptr])
                anc_ptr += 1
                b_ptr += 1
                
                if b_op and anc_ptr >= b_op[2]:
                    op_b_idx += 1
                
                if a_op:
                    tag_a, _, ai2, _, aj2 = a_op
                    if tag_a == 'delete':
                        if anc_ptr >= ai2:
                            op_a_idx += 1
                continue
            
            if not a_equal and not b_equal:
                a_changes = []
                b_changes = []
                
                if a_op:
                    tag_a, ai1, ai2, aj1, aj2 = a_op
                    if tag_a == 'delete':
                        anc_ptr = ai2
                    else:
                        while a_ptr < aj2:
                            a_changes.append(a_lines[a_ptr])
                            a_ptr += 1
                    op_a_idx += 1
                
                if b_op:
                    tag_b, bi1, bi2, bj1, bj2 = b_op
                    if tag_b == 'delete':
                        if anc_ptr < bi2:
                            anc_ptr = bi2
                    else:
                        while b_ptr < bj2:
                            b_changes.append(b_lines[b_ptr])
                            b_ptr += 1
                    op_b_idx += 1
                
                if a_changes == b_changes and len(a_changes) > 0:
                    merged_lines.extend(a_changes)
                elif len(a_changes) > 0 and len(b_changes) == 0:
                    merged_lines.extend(a_changes)
                elif len(b_changes) > 0 and len(a_changes) == 0:
                    merged_lines.extend(b_changes)
                else:
                    conflict_counter += 1
                    if auto_resolve:
                        merged_lines.extend(a_changes)
                        resolved_conflicts.append((conflict_counter, "auto_resolved_a"))
                    else:
                        merged_lines.append(conflict_marker_a + "\n")
                        merged_lines.extend(a_changes)
                        merged_lines.append(conflict_marker_b + "\n")
                        merged_lines.extend(b_changes)
                        merged_lines.append(conflict_marker_end + "\n")
                        conflicts.append(f"Conflict #{conflict_counter}")
                
                continue
            
            anc_ptr += 1
        
        else:
            while a_ptr < len(a_lines):
                merged_lines.append(a_lines[a_ptr])
                a_ptr += 1
            while b_ptr < len(b_lines):
                merged_lines.append(b_lines[b_ptr])
                b_ptr += 1
            break
    
    merged_content = reconstruct(merged_lines)
    
    return MergeResult(
        success=len(conflicts) == 0,
        merged_content=merged_content,
        conflicts=conflicts,
        ancestor_content=ancestor,
        branch_a_content=branch_a,
        branch_b_content=branch_b,
        resolved_conflicts=resolved_conflicts
    )
