#ifndef KERNINGPAIR_H
#define KERNINGPAIR_H

#include <QChar>
#include <QString>
#include <QMetaType>

class KerningPair
{
public:
    KerningPair();
    KerningPair(QChar left, QChar right, int value = 0);
    KerningPair(const KerningPair& other);
    ~KerningPair();

    KerningPair& operator=(const KerningPair& other);
    bool operator==(const KerningPair& other) const;
    bool operator<(const KerningPair& other) const;

    QChar leftChar() const;
    QChar rightChar() const;
    int value() const;
    int originalValue() const;
    bool isModified() const;

    void setValue(int value);
    void setOriginalValue(int value);
    void resetToOriginal();

    QString toString() const;
    QString pairString() const;

private:
    QChar m_left;
    QChar m_right;
    int m_value;
    int m_originalValue;
};

Q_DECLARE_METATYPE(KerningPair)

#endif
