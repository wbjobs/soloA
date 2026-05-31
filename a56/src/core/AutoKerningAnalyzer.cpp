#include "core/AutoKerningAnalyzer.h"
#include <QDebug>
#include <QFileInfo>
#include <QtMath>

AutoKerningAnalyzer::AutoKerningAnalyzer(QObject* parent)
    : QObject(parent)
    , m_library(nullptr)
    , m_initialized(false)
    , m_targetSpacing(12)
    , m_mode(AnalysisMode::Combined)
{
}

AutoKerningAnalyzer::~AutoKerningAnalyzer()
{
    cleanup();
}

bool AutoKerningAnalyzer::initialize()
{
    if (m_initialized) return true;

    FT_Error error = FT_Init_FreeType(&m_library);
    if (error != 0) {
        qWarning() << "FreeType 初始化失败:" << error;
        return false;
    }

    m_initialized = true;
    return true;
}

void AutoKerningAnalyzer::cleanup()
{
    if (m_library && m_initialized) {
        FT_Done_FreeType(m_library);
        m_library = nullptr;
        m_initialized = false;
    }
}

void AutoKerningAnalyzer::setTargetSpacing(int spacing)
{
    m_targetSpacing = spacing;
}

int AutoKerningAnalyzer::targetSpacing() const
{
    return m_targetSpacing;
}

void AutoKerningAnalyzer::setAnalysisMode(AutoKerningAnalyzer::AnalysisMode mode)
{
    m_mode = mode;
}

AutoKerningAnalyzer::AnalysisMode AutoKerningAnalyzer::analysisMode() const
{
    return m_mode;
}

QList<KerningRecommendation> AutoKerningAnalyzer::analyzeFont(
    const QString& fontPath,
    const QStringList& sampleTexts,
    int fontSize
)
{
    if (!initialize()) {
        return QList<KerningRecommendation>();
    }

    QSet<QChar> charSet;
    for (const QString& text : sampleTexts) {
        for (QChar ch : text) {
            charSet.insert(ch);
        }
    }

    QList<QChar> chars = charSet.toList();
    return analyzeAllPairs(fontPath, chars, chars, fontSize);
}

QList<KerningRecommendation> AutoKerningAnalyzer::analyzeAllPairs(
    const QString& fontPath,
    const QList<QChar>& leftChars,
    const QList<QChar>& rightChars,
    int fontSize
)
{
    QList<KerningRecommendation> recommendations;

    if (!initialize()) {
        return recommendations;
    }

    FT_Face face = nullptr;
    FT_Error error = FT_New_Face(m_library, fontPath.toStdString().c_str(), 0, &face);
    if (error != 0) {
        qWarning() << "无法加载字体:" << fontPath;
        return recommendations;
    }

    FT_Set_Pixel_Sizes(face, 0, fontSize);

    QList<QChar> allChars;
    QSet<QChar> charSet;
    for (QChar ch : leftChars) charSet.insert(ch);
    for (QChar ch : rightChars) charSet.insert(ch);
    allChars = charSet.toList();

    QMap<QChar, CharMetrics> metrics = analyzeCharacterMetrics(face, allChars, fontSize);

    int totalPairs = leftChars.size() * rightChars.size();
    int processed = 0;

    for (QChar left : leftChars) {
        if (!metrics.contains(left)) continue;

        for (QChar right : rightChars) {
            if (left == right || !metrics.contains(right)) {
                processed++;
                continue;
            }

            const CharMetrics& leftMetrics = metrics[left];
            const CharMetrics& rightMetrics = metrics[right];

            int recommendedKerning = calculateOptimalKerning(leftMetrics, rightMetrics);
            int currentKerning = 0;

            FT_UInt leftGlyph = FT_Get_Char_Index(face, left.unicode());
            FT_UInt rightGlyph = FT_Get_Char_Index(face, right.unicode());
            FT_Vector kerningVec;
            if (FT_Get_Kerning(face, leftGlyph, rightGlyph, FT_KERNING_DEFAULT, &kerningVec) == 0) {
                currentKerning = kerningVec.x >> 6;
            }

            if (recommendedKerning != currentKerning) {
                KerningRecommendation rec;
                rec.leftChar = left;
                rec.rightChar = right;
                rec.currentKerning = currentKerning;
                rec.recommendedKerning = recommendedKerning;
                rec.confidence = estimateConfidence(leftMetrics, rightMetrics);
                rec.reason = "基于视觉轮廓分析";
                recommendations.append(rec);
            }

            processed++;
            emit analysisProgress(processed, totalPairs);
        }
    }

    FT_Done_Face(face);
    emit analysisFinished(recommendations);
    return recommendations;
}

QList<KerningRecommendation> AutoKerningAnalyzer::analyzeSampleText(
    const QString& fontPath,
    const QString& sampleText,
    int fontSize
)
{
    QList<KerningRecommendation> recommendations;

    for (int i = 0; i < sampleText.length() - 1; ++i) {
        QChar left = sampleText[i];
        QChar right = sampleText[i + 1];

        bool exists = false;
        for (const KerningRecommendation& rec : recommendations) {
            if (rec.leftChar == left && rec.rightChar == right) {
                exists = true;
                break;
            }
        }

        if (!exists) {
            KerningRecommendation rec = analyzePair(fontPath, left, right, fontSize);
            if (rec.leftChar != QChar::Null) {
                recommendations.append(rec);
            }
        }
    }

    return recommendations;
}

KerningRecommendation AutoKerningAnalyzer::analyzePair(
    const QString& fontPath,
    QChar left,
    QChar right,
    int fontSize
)
{
    KerningRecommendation rec;
    rec.leftChar = QChar::Null;

    if (!initialize()) {
        return rec;
    }

    FT_Face face = nullptr;
    FT_Error error = FT_New_Face(m_library, fontPath.toStdString().c_str(), 0, &face);
    if (error != 0) {
        return rec;
    }

    FT_Set_Pixel_Sizes(face, 0, fontSize);

    QList<QChar> chars;
    chars << left << right;
    QMap<QChar, CharMetrics> metrics = analyzeCharacterMetrics(face, chars, fontSize);

    if (metrics.contains(left) && metrics.contains(right)) {
        const CharMetrics& leftMetrics = metrics[left];
        const CharMetrics& rightMetrics = metrics[right];

        rec.leftChar = left;
        rec.rightChar = right;
        rec.recommendedKerning = calculateOptimalKerning(leftMetrics, rightMetrics);

        FT_UInt leftGlyph = FT_Get_Char_Index(face, left.unicode());
        FT_UInt rightGlyph = FT_Get_Char_Index(face, right.unicode());
        FT_Vector kerningVec;
        if (FT_Get_Kerning(face, leftGlyph, rightGlyph, FT_KERNING_DEFAULT, &kerningVec) == 0) {
            rec.currentKerning = kerningVec.x >> 6;
        }

        rec.confidence = estimateConfidence(leftMetrics, rightMetrics);
        rec.reason = "基于视觉轮廓分析";
    }

    FT_Done_Face(face);
    return rec;
}

QMap<QChar, CharMetrics> AutoKerningAnalyzer::analyzeCharacterMetrics(
    FT_Face face,
    const QList<QChar>& chars,
    int fontSize
)
{
    Q_UNUSED(fontSize)
    QMap<QChar, CharMetrics> metrics;

    for (QChar ch : chars) {
        FT_UInt glyphIndex = FT_Get_Char_Index(face, ch.unicode());
        if (glyphIndex == 0) continue;

        FT_Int32 loadFlags = FT_LOAD_DEFAULT | FT_LOAD_FORCE_AUTOHINT;
        if (FT_Load_Glyph(face, glyphIndex, loadFlags) != 0) continue;

        if (FT_Render_Glyph(face->glyph, FT_RENDER_MODE_NORMAL) != 0) continue;

        FT_GlyphSlot slot = face->glyph;
        FT_Bitmap* bitmap = &slot->bitmap;

        CharMetrics m;
        m.character = ch;
        m.width = bitmap->width;
        m.height = bitmap->rows;
        m.bearingX = slot->bitmap_left;
        m.bearingY = slot->bitmap_top;
        m.advanceX = slot->advance.x >> 6;

        if (m.width > 0 && m.height > 0) {
            m.bitmap = QImage(m.width, m.height, QImage::Format_Grayscale8);
            for (int y = 0; y < m.height; ++y) {
                for (int x = 0; x < m.width; ++x) {
                    m.bitmap.setPixel(x, y, bitmap->buffer[y * bitmap->pitch + x]);
                }
            }

            extractCharProfiles(m);
        }

        metrics.insert(ch, m);
    }

    return metrics;
}

void AutoKerningAnalyzer::extractCharProfiles(CharMetrics& metrics)
{
    if (metrics.bitmap.isNull()) return;

    int height = metrics.height;
    int width = metrics.width;

    metrics.leftProfile.resize(height);
    metrics.rightProfile.resize(height);
    metrics.leftExtent = metrics.width;
    metrics.rightExtent = 0;

    for (int y = 0; y < height; ++y) {
        int leftMost = width;
        int rightMost = 0;

        for (int x = 0; x < width; ++x) {
            int pixel = metrics.bitmap.pixelIndex(x, y);
            if (pixel > 50) {
                if (x < leftMost) leftMost = x;
                if (x > rightMost) rightMost = x;
            }
        }

        if (leftMost <= rightMost) {
            metrics.leftProfile[y] = leftMost;
            metrics.rightProfile[y] = rightMost;
            if (leftMost < metrics.leftExtent) metrics.leftExtent = leftMost;
            if (rightMost > metrics.rightExtent) metrics.rightExtent = rightMost;
        } else {
            metrics.leftProfile[y] = -1;
            metrics.rightProfile[y] = -1;
        }
    }
}

int AutoKerningAnalyzer::calculateOptimalKerning(
    const CharMetrics& leftMetrics,
    const CharMetrics& rightMetrics
)
{
    switch (m_mode) {
    case AnalysisMode::ProfileBased:
        return analyzeProfileSpacing(leftMetrics, rightMetrics);
    case AnalysisMode::AreaBased:
        return analyzeAreaSpacing(leftMetrics, rightMetrics);
    case AnalysisMode::Combined:
    default: {
        int profile = analyzeProfileSpacing(leftMetrics, rightMetrics);
        int area = analyzeAreaSpacing(leftMetrics, rightMetrics);
        return (profile * 7 + area * 3) / 10;
    }
    }
}

int AutoKerningAnalyzer::analyzeProfileSpacing(
    const CharMetrics& left,
    const CharMetrics& right
)
{
    if (left.rightProfile.isEmpty() || right.leftProfile.isEmpty()) {
        return 0;
    }

    int minSpacing = INT_MAX;
    int validRows = 0;

    int leftHeight = left.height;
    int rightHeight = right.height;
    int minHeight = qMin(leftHeight, rightHeight);

    for (int y = 0; y < minHeight; ++y) {
        int leftIdx = (leftHeight >= rightHeight) ? y + (leftHeight - rightHeight) / 2 : y;
        int rightIdx = (rightHeight >= leftHeight) ? y + (rightHeight - leftHeight) / 2 : y;

        if (leftIdx >= 0 && leftIdx < left.rightProfile.size() &&
            rightIdx >= 0 && rightIdx < right.leftProfile.size()) {

            int leftRight = left.rightProfile[leftIdx];
            int rightLeft = right.leftProfile[rightIdx];

            if (leftRight >= 0 && rightLeft >= 0) {
                int spacing = (right.bearingX + rightLeft) - (left.bearingX + leftRight + 1);
                if (spacing < minSpacing) {
                    minSpacing = spacing;
                }
                validRows++;
            }
        }
    }

    if (validRows == 0 || minSpacing == INT_MAX) {
        return 0;
    }

    int neededAdjustment = m_targetSpacing - minSpacing;
    return -neededAdjustment;
}

int AutoKerningAnalyzer::analyzeAreaSpacing(
    const CharMetrics& left,
    const CharMetrics& right
)
{
    if (left.bitmap.isNull() || right.bitmap.isNull()) {
        return 0;
    }

    int leftBlackPixels = 0;
    int rightBlackPixels = 0;

    for (int y = 0; y < left.height; ++y) {
        for (int x = 0; x < left.width; ++x) {
            if (left.bitmap.pixelIndex(x, y) > 100) {
                leftBlackPixels++;
            }
        }
    }

    for (int y = 0; y < right.height; ++y) {
        for (int x = 0; x < right.width; ++x) {
            if (right.bitmap.pixelIndex(x, y) > 100) {
                rightBlackPixels++;
            }
        }
    }

    int totalPixels = left.height * left.width;
    double leftDensity = totalPixels > 0 ? (double)leftBlackPixels / totalPixels : 0;

    if (leftDensity > 0.4) {
        return -3;
    } else if (leftDensity < 0.05) {
        return 3;
    }

    return 0;
}

int AutoKerningAnalyzer::estimateConfidence(const CharMetrics& left, const CharMetrics& right)
{
    int confidence = 50;

    if (left.width > 0 && right.width > 0) {
        confidence += 20;
    }

    if (left.height > 0 && right.height > 0) {
        confidence += 15;
    }

    int validLeft = 0;
    for (int v : left.rightProfile) {
        if (v >= 0) validLeft++;
    }
    int validRight = 0;
    for (int v : right.leftProfile) {
        if (v >= 0) validRight++;
    }

    if (validLeft > left.height * 0.3 && validRight > right.height * 0.3) {
        confidence += 15;
    }

    return qMin(confidence, 100);
}

QStringList AutoKerningAnalyzer::defaultEnglishSamples()
{
    return QStringList()
        << "AVAWAV"
        << "ToTeTy"
        << "WaWeWo"
        << "LYLy"
        << "PaPePiPoPu"
        << "FaFeFiFoFu"
        << "TaTeTiToTu"
        << "KaKeKiKoKu"
        << "Hello World"
        << "Type Design"
        << "Typography"
        << "Kerning Pair"
        << "Visual Balance"
        << "Character Spacing"
        << "Font Quality";
}

QStringList AutoKerningAnalyzer::defaultChineseSamples()
{
    return QStringList()
        << "中国人民"
        << "文字设计"
        << "字体排版"
        << "视觉平衡"
        << "字符间距"
        << "汉字处理"
        << "电脑软件"
        << "开发工具"
        << "应用程序"
        << "界面设计"
        << "用户体验"
        << "技术支持"
        << "服务中心"
        << "产品质量"
        << "创新科技";
}

QList<QChar> AutoKerningAnalyzer::commonEnglishChars()
{
    QList<QChar> chars;
    for (char c = 'A'; c <= 'Z'; ++c) chars << QChar(c);
    for (char c = 'a'; c <= 'z'; ++c) chars << QChar(c);
    chars << QChar('.') << QChar(',') << QChar('!') << QChar('?')
          << QChar(':') << QChar(';') << QChar('"') << QChar('\'');
    return chars;
}

QList<QChar> AutoKerningAnalyzer::commonChineseChars()
{
    QString common = QStringLiteral("的一是了不人在大有这上中来国到说我也和就要可你会能对生最着没看那好她起当想作成开事们而方多经么得与知已从心学还都就也又用种自己样发过各天如工下新能地实可家以长然出对多而儿后定自全者学样文把再前做分新面头先口力手水行问回学小如起去二来成天用下对学文头年方会好年能本同此但因面高两女里心什长儿此去它只小如多立已而子点从本又学们开但面天心些样后同而用子对学又去回学起自本去只问对去心");
    QList<QChar> chars;
    for (QChar ch : common) {
        if (!chars.contains(ch)) {
            chars << ch;
        }
    }
    return chars;
}
