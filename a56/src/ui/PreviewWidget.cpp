#include "ui/PreviewWidget.h"
#include <QPainter>
#include <QPixmap>

PreviewWidget::PreviewWidget(PreviewRenderer* renderer, QWidget* parent)
    : QWidget(parent)
    , m_renderer(renderer)
    , m_adjuster(nullptr)
{
    setupUI();
}

PreviewWidget::~PreviewWidget()
{
}

void PreviewWidget::setAdjuster(KerningAdjuster* adjuster)
{
    m_adjuster = adjuster;
    if (m_renderer) {
        m_renderer->setAdjuster(adjuster);
    }
    refresh();
}

void PreviewWidget::refresh()
{
    updatePreview();
}

void PreviewWidget::updatePreview()
{
    if (!m_renderer) {
        m_previewLabel->setText(tr("请先加载字体"));
        return;
    }

    QImage image = m_renderer->renderPreview();
    if (image.isNull()) {
        m_previewLabel->setText(tr("无法渲染预览"));
        return;
    }

    QPixmap pixmap = QPixmap::fromImage(image);
    m_previewLabel->setPixmap(pixmap);
    m_previewLabel->adjustSize();
}

void PreviewWidget::setupUI()
{
    QVBoxLayout* mainLayout = new QVBoxLayout(this);
    mainLayout->setContentsMargins(5, 5, 5, 5);

    QHBoxLayout* toolbarLayout = new QHBoxLayout();

    toolbarLayout->addWidget(new QLabel(tr("预览文本:"), this));

    m_previewTextEdit = new QLineEdit(this);
    m_previewTextEdit->setText(tr("AVAWAVTeTo"));
    m_previewTextEdit->setMinimumWidth(200);
    toolbarLayout->addWidget(m_previewTextEdit);

    toolbarLayout->addWidget(new QLabel(tr("字号:"), this));

    m_fontSizeSpin = new QSpinBox(this);
    m_fontSizeSpin->setRange(12, 200);
    m_fontSizeSpin->setValue(48);
    toolbarLayout->addWidget(m_fontSizeSpin);

    toolbarLayout->addWidget(new QLabel(tr("模式:"), this));

    m_modeCombo = new QComboBox(this);
    m_modeCombo->addItem(tr("上下对比"), static_cast<int>(PreviewRenderer::Mode::SideBySide));
    m_modeCombo->addItem(tr("叠加对比"), static_cast<int>(PreviewRenderer::Mode::Overlay));
    m_modeCombo->addItem(tr("差异对比"), static_cast<int>(PreviewRenderer::Mode::Difference));
    toolbarLayout->addWidget(m_modeCombo);

    m_refreshBtn = new QPushButton(tr("刷新"), this);
    toolbarLayout->addWidget(m_refreshBtn);

    toolbarLayout->addStretch();

    mainLayout->addLayout(toolbarLayout);

    m_scrollArea = new QScrollArea(this);
    m_scrollArea->setWidgetResizable(true);
    m_scrollArea->setBackgroundRole(QPalette::Light);

    m_previewLabel = new QLabel(this);
    m_previewLabel->setAlignment(Qt::AlignCenter);
    m_previewLabel->setText(tr("请先加载字体"));
    m_previewLabel->setStyleSheet("QLabel { background-color: white; padding: 10px; }");

    m_scrollArea->setWidget(m_previewLabel);
    mainLayout->addWidget(m_scrollArea);

    connect(m_previewTextEdit, &QLineEdit::editingFinished,
            this, [this]() {
                if (m_renderer) {
                    m_renderer->setPreviewText(m_previewTextEdit->text());
                    updatePreview();
                }
            });

    connect(m_fontSizeSpin, QOverload<int>::of(&QSpinBox::valueChanged),
            this, [this](int size) {
                if (m_renderer) {
                    m_renderer->setFontSize(size);
                    updatePreview();
                }
            });

    connect(m_modeCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, [this](int index) {
                if (m_renderer) {
                    PreviewRenderer::Mode mode = static_cast<PreviewRenderer::Mode>(
                        m_modeCombo->itemData(index).toInt()
                    );
                    m_renderer->setMode(mode);
                    updatePreview();
                }
            });

    connect(m_refreshBtn, &QPushButton::clicked,
            this, &PreviewWidget::onRefreshClicked);

    if (m_renderer) {
        connect(m_renderer, &PreviewRenderer::previewChanged,
                this, &PreviewWidget::updatePreview);
    }
}

void PreviewWidget::onPreviewTextChanged(const QString& text)
{
    Q_UNUSED(text)
    updatePreview();
}

void PreviewWidget::onFontSizeChanged(int size)
{
    Q_UNUSED(size)
    updatePreview();
}

void PreviewWidget::onModeChanged(int index)
{
    Q_UNUSED(index)
    updatePreview();
}

void PreviewWidget::onRefreshClicked()
{
    if (m_renderer) {
        m_renderer->setPreviewText(m_previewTextEdit->text());
        m_renderer->setFontSize(m_fontSizeSpin->value());
    }
    updatePreview();
}
