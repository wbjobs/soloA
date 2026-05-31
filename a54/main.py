#!/usr/bin/env python
"""
地下水溶质运移数值模拟工具

核心模块：
1. 数值求解模块 - 有限差分法求解对流-扩散方程
2. 参数验证模块 - 参数有效性检查
3. 结果可视化模块 - Matplotlib热力图、时间序列曲线、VTK导出
4. 参数敏感性分析 - 关键参数的敏感性分析
5. 批量模拟 - 多组模拟自动执行

运行方式：
- 命令行: python main.py [命令] [参数]
- GUI界面: python main.py --gui
"""

import sys
import argparse


def main():
    parser = argparse.ArgumentParser(
        description='地下水溶质运移数值模拟工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument('--gui', action='store_true', help='启动图形界面')
    
    args, remaining = parser.parse_known_args()
    
    if args.gui:
        from gui.tkinter_gui import main as gui_main
        gui_main()
        return 0
    else:
        from cli.cli_interface import main as cli_main
        sys.argv = [sys.argv[0]] + remaining
        return cli_main()


if __name__ == '__main__':
    sys.exit(main())
