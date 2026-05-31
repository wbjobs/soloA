import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from merge.three_way_merge import (
    three_way_merge,
    MergeResult,
    MergeHunk,
    LineDiff,
    diff_text,
    find_merge_base
)


class TestThreeWayMerge:
    def test_no_changes_both_sides(self):
        ancestor = "line1\nline2\nline3"
        branch_a = "line1\nline2\nline3"
        branch_b = "line1\nline2\nline3"
        
        result = three_way_merge(ancestor, branch_a, branch_b)
        
        assert result.success is True
        assert len(result.conflicts) == 0
        assert result.merged_content == ancestor
    
    def test_same_change_both_sides(self):
        ancestor = "line1\nline2\nline3"
        branch_a = "line1\nline2_modified\nline3"
        branch_b = "line1\nline2_modified\nline3"
        
        result = three_way_merge(ancestor, branch_a, branch_b)
        
        assert result.success is True
        assert len(result.conflicts) == 0
        assert "line2_modified" in result.merged_content
    
    def test_different_lines_modified(self):
        ancestor = "line1\nline2\nline3\nline4"
        branch_a = "line1_modified\nline2\nline3\nline4"
        branch_b = "line1\nline2\nline3_modified\nline4"
        
        result = three_way_merge(ancestor, branch_a, branch_b)
        
        assert "line1_modified" in result.merged_content
        assert "line3_modified" in result.merged_content
    
    def test_conflict_same_line_modified(self):
        ancestor = "line1\nline2\nline3"
        branch_a = "line1\nline2_a\nline3"
        branch_b = "line1\nline2_b\nline3"
        
        result = three_way_merge(ancestor, branch_a, branch_b)
        
        assert result.success is False
        assert len(result.conflicts) >= 1
        assert "<<<<<<<" in result.merged_content
        assert "=======" in result.merged_content
        assert ">>>>>>>" in result.merged_content
        assert "line2_a" in result.merged_content
        assert "line2_b" in result.merged_content
    
    def test_merge_with_custom_markers(self):
        ancestor = "line1\nline2\nline3"
        branch_a = "line1\nline2_a\nline3"
        branch_b = "line1\nline2_b\nline3"
        
        result = three_way_merge(
            ancestor, branch_a, branch_b,
            conflict_marker_a="<<<<<<< FEATURE",
            conflict_marker_end=">>>>>>> MAIN"
        )
        
        assert "<<<<<<< FEATURE" in result.merged_content
        assert ">>>>>>> MAIN" in result.merged_content
    
    def test_a_adds_b_unchanged(self):
        ancestor = "line1\nline3"
        branch_a = "line1\nline2\nline3"
        branch_b = "line1\nline3"
        
        result = three_way_merge(ancestor, branch_a, branch_b)
        
        assert "line2" in result.merged_content
    
    def test_a_deletes_b_unchanged(self):
        ancestor = "line1\nline2\nline3"
        branch_a = "line1\nline3"
        branch_b = "line1\nline2\nline3"
        
        result = three_way_merge(ancestor, branch_a, branch_b)
        
        assert "line2" not in result.merged_content
    
    def test_empty_ancestor(self):
        ancestor = ""
        branch_a = "content_a"
        branch_b = "content_b"
        
        result = three_way_merge(ancestor, branch_a, branch_b)
        
        assert result.success is False
    
    def test_returns_merge_result(self):
        ancestor = "line1\nline2"
        branch_a = "line1\nline2_a"
        branch_b = "line1\nline2"
        
        result = three_way_merge(ancestor, branch_a, branch_b)
        
        assert isinstance(result, MergeResult)
        assert result.ancestor_content == ancestor
        assert result.branch_a_content == branch_a
        assert result.branch_b_content == branch_b


class TestDiffText:
    def test_diff_text_same(self):
        old = "line1\nline2"
        new = "line1\nline2"
        
        changes = diff_text(old, new)
        assert len(changes) == 0
    
    def test_diff_text_modified(self):
        old = "line1\nline2"
        new = "line1\nline2_modified"
        
        changes = diff_text(old, new)
        assert len(changes) > 0
        assert any(c['operation'] == 'replace' for c in changes)


class TestFindMergeBase:
    def test_find_merge_base_exists(self):
        history_a = ["v1", "v2", "v3", "v4"]
        history_b = ["v1", "v2", "v5", "v6"]
        
        base = find_merge_base(history_a, history_b)
        assert base == "v2"
    
    def test_find_merge_base_no_common(self):
        history_a = ["a1", "a2"]
        history_b = ["b1", "b2"]
        
        base = find_merge_base(history_a, history_b)
        assert base is None
