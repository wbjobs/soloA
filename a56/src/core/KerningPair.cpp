#include "core/KerningPair.h"

KerningPair::KerningPair()
    : m_left(QChar::Null)
    , m_right(QChar::Null)
    , m_value(0)
    , m_originalValue(0)
{
}

KerningPair::KerningPair(QChar left, QChar right, int value)
    : m_left(left)
    , m_right(right)
    , m_value(value)
    , m_originalValue(value)
{
}

KerningPair::KerningPair(const KerningPair& other)
    : m_left(other.m_left)
    , m_right(other.m_right)
    , m_value(other.m_value)
    , m_originalValue(other.m_originalValue)
{
}

KerningPair::~KerningPair()
{
}

KerningPair& KerningPair::operator=(const KerningPair& other)
{
    if (this != &other) {
        m_left = other.m_left;
        m_right = other.m_right;
        m_value = other.m_value;
        m_originalValue = other.m_originalValue;
    }
    return *this;
}

bool KerningPair::operator==(const KerningPair& other) const
{
    return m_left == other.m_left && m_right == other.m_right;
}

bool KerningPair::operator<(const KerningPair& other) const
{
    if (m_left != other.m_left) {
        return m_left < other.m_left;
    }
    return m_right < other.m_right;
}

QChar KerningPair::leftChar() const
{
    return m_left;
}

QChar KerningPair::rightChar() const
{
    return m_right;
}

int KerningPair::value() const
{
    return m_value;
}

int KerningPair::originalValue() const
{
    return m_originalValue;
}

bool KerningPair::isModified() const
{
    return m_value != m_originalValue;
}

void KerningPair::setValue(int value)
{
    m_value = value;
}

void KerningPair::setOriginalValue(int value)
{
    m_originalValue = value;
}

void KerningPair::resetToOriginal()
{
    m_value = m_originalValue;
}

QString KerningPair::toString() const
{
    return QStringLiteral("%1%2: %3 (原始: %4)")
        .arg(m_left).arg(m_right)
        .arg(m_value).arg(m_originalValue);
}

QString KerningPair::pairString() const
{
    return QStringLiteral("%1%2").arg(m_left).arg(m_right);
}
