package model

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID           uint           `gorm:"primaryKey;autoIncrement" json:"id"`
	Username     string         `gorm:"uniqueIndex;size:50;not null" json:"username"`
	Password     string         `gorm:"size:255;not null" json:"-"`
	Email        string         `gorm:"size:100" json:"email"`
	Phone        string         `gorm:"size:20" json:"phone"`
	Role         string         `gorm:"size:20;default:user" json:"role"`
	Status       int            `gorm:"default:1" json:"status"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`

	Devices      []Device       `gorm:"foreignKey:UserID" json:"devices,omitempty"`
	Groups       []DeviceGroup  `gorm:"foreignKey:UserID" json:"groups,omitempty"`
	Rules        []Rule         `gorm:"foreignKey:UserID" json:"rules,omitempty"`
	Alerts       []Alert        `gorm:"foreignKey:UserID" json:"alerts,omitempty"`
}

func (User) TableName() string {
	return "users"
}

const (
	RoleAdmin  = "admin"
	RoleUser   = "user"

	UserStatusActive   = 1
	UserStatusInactive = 0
)

func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin
}

func (u *User) IsActive() bool {
	return u.Status == UserStatusActive
}
