package game

import "errors"

var (
	ErrRoomNotFound     = errors.New("room not found")
	ErrRoomFull         = errors.New("room is full")
	ErrPlayerNotFound   = errors.New("player not found")
	ErrPlayerDead       = errors.New("player is dead")
	ErrEnemyNotFound    = errors.New("enemy not found")
	ErrEnemyDead        = errors.New("enemy is dead")
	ErrEnemyTooFar      = errors.New("enemy is too far")
	ErrInvalidPosition  = errors.New("invalid position")
	ErrPositionBlocked  = errors.New("position is blocked")
	ErrPositionTooFar   = errors.New("position is too far")
	ErrInvalidAction    = errors.New("invalid action")
	ErrGameNotStarted   = errors.New("game not started")
)
