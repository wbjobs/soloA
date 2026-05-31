import cv2
import numpy as np
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.image_preprocessing import ImagePreprocessor
from app.services.layout_analysis import LayoutAnalyzer


def create_test_image():
    h, w = 600, 800
    
    bg = np.full((h, w, 3), 200, dtype=np.uint8)
    
    x, y, w, h = 100, 80, 600, 450
    cv2.rectangle(bg, (x-20, y-20), (x+w+20, y+h+20), (180, 150, 120), -1)
    
    text_lines = [
        "古籍文档智能修复系统测试",
        "This is a test for ancient document processing",
        "低对比度文字区域检测测试",
        "Testing low contrast text detection",
        "版面分析与OCR验证",
        "Layout analysis and OCR verification",
    ]
    
    font = cv2.FONT_HERSHEY_SIMPLEX
    y_pos = y + 50
    
    for i, line in enumerate(text_lines):
        if i % 2 == 0:
            text_color = (170, 140, 110)
        else:
            text_color = (160, 130, 100)
        
        cv2.putText(bg, line, (x, y_pos), font, 0.8, text_color, 2)
        y_pos += 70
    
    watermark = np.random.randint(0, 50, (200, 300), dtype=np.uint8)
    watermark = cv2.resize(watermark, (w, h))
    watermark = watermark[y:y+h, x:x+w]
    
    for c in range(3):
        bg[y:y+h, x:x+w, c] = cv2.addWeighted(
            bg[y:y+h, x:x+w, c], 0.85,
            watermark, 0.15, 0
        )
    
    return bg


def test_preprocessing():
    print("=" * 60)
    print("测试1: 图像预处理 - 低对比度增强")
    print("=" * 60)
    
    test_img = create_test_image()
    
    preprocessor = ImagePreprocessor()
    
    gray = cv2.cvtColor(test_img, cv2.COLOR_BGR2GRAY)
    
    local_contrast = preprocessor._calculate_local_contrast(gray)
    avg_contrast = np.mean(local_contrast)
    low_contrast_ratio = np.mean(local_contrast < 0.3)
    
    print(f"平均局部对比度: {avg_contrast:.4f}")
    print(f"低对比度像素占比: {low_contrast_ratio:.2%}")
    
    enhanced, _ = preprocessor.advanced_contrast_enhancement(test_img)
    
    enhanced_gray = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
    enhanced_contrast = preprocessor._calculate_local_contrast(enhanced_gray)
    avg_enhanced = np.mean(enhanced_contrast)
    low_enhanced = np.mean(enhanced_contrast < 0.3)
    
    print(f"增强后平均对比度: {avg_enhanced:.4f}")
    print(f"增强后低对比度占比: {low_enhanced:.2%}")
    
    improvement = (avg_enhanced - avg_contrast) / avg_contrast * 100
    print(f"对比度提升: {improvement:.2f}%")
    
    binary = preprocessor.hybrid_binarization(enhanced_gray, enhanced_contrast)
    
    original_foreground = np.count_nonzero(cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1])
    enhanced_foreground = np.count_nonzero(binary)
    
    print(f"原始二值化前景像素: {original_foreground}")
    print(f"混合二值化前景像素: {enhanced_foreground}")
    print(f"检出率提升: {(enhanced_foreground - original_foreground) / original_foreground * 100:.2f}%")
    
    return test_img, enhanced, binary


def test_layout_analysis():
    print("\n" + "=" * 60)
    print("测试2: 版面分析 - 文本区域检测")
    print("=" * 60)
    
    test_img = create_test_image()
    
    preprocessor = ImagePreprocessor()
    analyzer = LayoutAnalyzer()
    
    processed, binary, stats = preprocessor.preprocess_pipeline(test_img)
    
    print(f"预处理统计: {stats}")
    
    gray = cv2.cvtColor(processed, cv2.COLOR_BGR2GRAY)
    
    regions = analyzer.detect_text_regions(binary, gray)
    
    print(f"检测到的文本区域数量: {len(regions)}")
    
    for i, region in enumerate(regions):
        print(f"  区域 {i+1}: ({region.x},{region.y}) {region.width}x{region.height} "
              f"置信度={region.confidence:.2f} "
              f"竖排={'是' if region.is_vertical else '否'}")
    
    all_regions = analyzer.analyze_layout(processed, binary)
    text_regions = [r for r in all_regions if r.region_type == 'text']
    
    print(f"\n完整版面分析结果:")
    print(f"  总区域数: {len(all_regions)}")
    print(f"  文本区域: {len(text_regions)}")
    
    return regions, all_regions


def test_simulation():
    print("\n" + "=" * 60)
    print("测试3: 低对比度场景模拟验证")
    print("=" * 60)
    
    test_img = create_test_image()
    
    preprocessor = ImagePreprocessor()
    analyzer = LayoutAnalyzer()
    
    gray = cv2.cvtColor(test_img, cv2.COLOR_BGR2GRAY)
    
    _, original_binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    processed, advanced_binary, stats = preprocessor.preprocess_pipeline(test_img)
    
    local_contrast = preprocessor._calculate_local_contrast(gray)
    low_contrast_mask = local_contrast < 0.3
    
    original_in_low = np.count_nonzero(original_binary[low_contrast_mask])
    advanced_in_low = np.count_nonzero(advanced_binary[low_contrast_mask])
    
    total_low = np.count_nonzero(low_contrast_mask)
    
    print(f"低对比度区域像素总数: {total_low}")
    print(f"原始OTSU在低对比度区域检出: {original_in_low}")
    print(f"混合二值化在低对比度区域检出: {advanced_in_low}")
    
    if original_in_low > 0:
        improvement = (advanced_in_low - original_in_low) / original_in_low * 100
        print(f"低对比度区域检出率提升: {improvement:.2f}%")
    else:
        print(f"低对比度区域检出数从0提升到 {advanced_in_low}")


def main():
    print("\n古籍文档智能修复系统 - 低对比度Bug修复验证测试")
    print("=" * 60)
    
    try:
        test_preprocessing()
        test_layout_analysis()
        test_simulation()
        
        print("\n" + "=" * 60)
        print("测试完成!")
        print("=" * 60)
        print("\n关键改进总结:")
        print("1. 多尺度CLAHE: 根据局部对比度自适应增强")
        print("2. 背景建模: 消除水渍和阴影")
        print("3. 混合二值化: Niblack+Sauvola+投票+边缘增强")
        print("4. 多尺度形态学: 6种核尺寸覆盖不同文本")
        print("5. 边缘增强检测: Sobel算子补充低对比度边缘")
        print("6. 投影法检测: 基于投影的文本行检测")
        print("7. 智能合并: 重叠和邻近区域合并")
        
    except Exception as e:
        print(f"测试过程中发生错误: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
