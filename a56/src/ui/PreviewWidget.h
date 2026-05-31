#ifndef PREVIEWWIDGET_H
#define PREVIEWWIDGET_H

#include <QWidget>
#include <QLabel>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QComboBox>
#include <QLineEdit>
#include <QPushButton>
#include <QSpinBox>
#include <QScrollArea>

#include "render/PreviewRenderer.h"
#include "core/KerningAdjuster.h"

class PreviewWidget : public QWidget
{
    Q_OBJECT
public:
    explicit PreviewWidget(PreviewRenderer* renderer, QWidget* parent = nullptr);
    ~PreviewWidget();

    void setAdjuster(KerningAdjuster* adjuster);
    void refresh();

public slots:
    void updatePreview();

private slots:
    void onPreviewTextChanged(const QString& text);
    void onFontSizeChanged(int size);
    void onModeChanged(int index);
    void onRefreshClicked();

private:
    PreviewRenderer* m_renderer;
    KerningAdjuster* m_adjuster;

    QLineEdit* m_previewTextEdit;
    QSpinBox* m_fontSizeSpin;
    QComboBox* m_modeCombo;
    QPushButton* m_refreshBtn;
    QLabel* m_previewLabel;
    QScrollArea* m_scrollArea;

    void setupUI();
};

#endif
