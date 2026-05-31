package main

import (
	"log"
	"net/http"

	"roguelike-server/internal/handlers"
	"roguelike-server/internal/game"
)

func main() {
	log.Println("Starting Roguelike Server...")

	gameManager := game.NewGameManager()
	gameManager.Start()

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handlers.HandleWebSocket(w, r, gameManager)
	})

	log.Println("Server running on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal("Server error:", err)
	}
}
