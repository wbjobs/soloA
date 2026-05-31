#ifndef AUTOKERNINGANALYZER_H
#define AUTOKERNINGANALYZER_H

#include <QObject>
#include <QString>
#include <QList>
#include <QMap>
#include <QImage>
#include <QChar>
#include <QSharedPointer>

#include <ft2build.h>
#include FT_FREETYPE_H

#include "core/KerningPair.h"
#include "core/FontParser.h"

struct CharMetrics
{
    QChar character;
    int width;
    int height;
    int bearingX;
    int bearingY;
    int advanceX;
    QImage bitmap;
    QList<int> leftProfile;
    QList<int> rightProfile;
    int leftExtent;
    int rightExtent;
};

struct KerningRecommendation
{
    QChar leftChar;
    QChar rightChar;
    int currentKerning;
    int recommendedKerning;
    int confidence;
    QString reason;

    QString pairString() const {
        return QString("%1%2").arg(leftChar).arg(rightChar);
    }
};

class AutoKerningAnalyzer : public QObject
{
    Q_OBJECT
public:
    enum class AnalysisMode {
        ProfileBased,
        AreaBased,
        Combined
    };

    explicit AutoKerningAnalyzer(QObject* parent = nullptr);
    ~AutoKerningAnalyzer();

    bool initialize();
    void cleanup();

    void setTargetSpacing(int spacing);
    int targetSpacing() const;

    void setAnalysisMode(AnalysisMode mode);
    AnalysisMode analysisMode() const;

    QList<KerningRecommendation> analyzeFont(
        const QString& fontPath,
        const QStringList& sampleTexts,
        int fontSize = 48
    );

    QList<KerningRecommendation> analyzeAllPairs(
        const QString& fontPath,
        const QList<QChar>& leftChars,
        const QList<QChar>& rightChars,
        int fontSize = 48
    );

    QList<KerningRecommendation> analyzeSampleText(
        const QString& fontPath,
        const QString& sampleText,
        int fontSize = 48
    );

    KerningRecommendation analyzePair(
        const QString& fontPath,
        QChar left,
        QChar right,
        int fontSize = 48
    );

    static QStringList defaultEnglishSamples();
    static QStringList defaultChineseSamples();
    static QList<QChar> commonEnglishChars();
    static QList<QChar> commonChineseChars();

signals:
    void analysisProgress(int current, int total);
    void analysisFinished(const QList<KerningRecommendation>& recommendations);

private:
    FT_Library m_library;
    bool m_initialized;
    int m_targetSpacing;
    AnalysisMode m_mode;

    QMap<QChar, CharMetrics> analyzeCharacterMetrics(
        FT_Face face,
        const QList<QChar>& chars,
        int fontSize
    );

    int calculateOptimalKerning(
        const CharMetrics& leftMetrics,
        const CharMetrics& rightMetrics
    );

    int analyzeProfileSpacing(
        const CharMetrics& left,
        const CharMetrics& right
    );

    int analyzeAreaSpacing(
        const CharMetrics& left,
        const CharMetrics& right
    );

    void extractCharProfiles(CharMetrics& metrics);
    int estimateConfidence(const CharMetrics& left, const CharMetrics& right);
};

#endif
