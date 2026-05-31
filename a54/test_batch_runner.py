import sys
import os
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))

from batch.batch_runner import BatchRunner

print("=" * 60)
print("测试5: 批量模拟")
print("=" * 60)

runner = BatchRunner(output_dir='test_batch_output')
results = runner.run_from_file('test_batch.json')

success_count = sum(1 for r in results if r['status'] == 'success')
print(f"批量模拟结果: 成功 {success_count}/{len(results)}")

for result in results:
    print(f"  模拟 {result['index']+1}: {result['status']}")
    if result['status'] == 'success':
        print(f"    输出目录: {result['output_dir']}")
    else:
        print(f"    错误: {result.get('error', 'Unknown')}")

print("\n" + "=" * 60)
print("所有批量模拟测试完成!")
print("=" * 60)
