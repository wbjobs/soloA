#include "ui/FontListWidget.h"
#include <QFileInfo>

FontListWidget::FontListWidget(FontManager* manager, QWidget* parent)
    : QWidget(parent)
    , m_manager(manager)
{
    QVBoxLayout* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);

    m_countLabel = new QLabel(tr("已加载: 0 个字体"), this);
    layout->addWidget(m_countLabel);

    m_listWidget = new QListWidget(this);
    m_listWidget->setSelectionMode(QAbstractItemView::SingleSelection);
    m_listWidget->setAlternatingRowColors(true);
    layout->addWidget(m_listWidget);

    connect(m_listWidget, &QListWidget::itemSelectionChanged,
            this, &FontListWidget::onItemSelectionChanged);
    connect(m_listWidget, &QListWidget::itemDoubleClicked,
            this, &FontListWidget::onItemDoubleClicked);

    if (m_manager) {
        connect(m_manager, &FontManager::fontsChanged,
                this, &FontListWidget::onItemChanged);
    }

    refresh();
}

FontListWidget::~FontListWidget()
{
}

QString FontListWidget::selectedFontPath() const
{
    QListWidgetItem* item = m_listWidget->currentItem();
    if (!item) return QString();
    return item->data(Qt::UserRole).toString();
}

void FontListWidget::selectFont(const QString& filePath)
{
    for (int i = 0; i < m_listWidget->count(); ++i) {
        QListWidgetItem* item = m_listWidget->item(i);
        if (item->data(Qt::UserRole).toString() == filePath) {
            m_listWidget->setCurrentItem(item);
            break;
        }
    }
}

void FontListWidget::refresh()
{
    m_listWidget->clear();

    if (!m_manager) {
        m_countLabel->setText(tr("已加载: 0 个字体"));
        return;
    }

    auto fonts = m_manager->fonts();
    m_countLabel->setText(tr("已加载: %1 个字体").arg(fonts.size()));

    for (const auto& info : fonts) {
        QListWidgetItem* item = new QListWidgetItem(m_listWidget);
        QString displayText = QStringLiteral("%1 - %2")
            .arg(info->familyName).arg(info->styleName);
        item->setText(displayText);
        item->setData(Qt::UserRole, info->filePath);
        item->setToolTip(info->filePath);
        m_listWidget->addItem(item);
    }
}

void FontListWidget::onItemChanged()
{
    refresh();
}

void FontListWidget::onItemSelectionChanged()
{
    emit fontSelected(selectedFontPath());
}

void FontListWidget::onItemDoubleClicked(QListWidgetItem* item)
{
    if (item) {
        emit fontDoubleClicked(item->data(Qt::UserRole).toString());
    }
}
