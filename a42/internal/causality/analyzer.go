package causality

import (
	"sort"
	"time"

	"audit-service/internal/model"
)

type Analyzer struct{}

func NewAnalyzer() *Analyzer {
	return &Analyzer{}
}

type BuildOptions struct {
	StartTime   time.Time
	EndTime     time.Time
	IncludePayload bool
}

func (a *Analyzer) BuildCausalityGraph(events []*model.AuditEvent, opts *BuildOptions) *model.CausalityGraph {
	if opts == nil {
		opts = &BuildOptions{IncludePayload: false}
	}

	filtered := a.filterEvents(events, opts)

	eventMap := make(map[string]*model.AuditEvent)
	for _, event := range filtered {
		eventMap[event.EventID] = event
	}

	nodes := make([]*model.CausalityNode, 0, len(filtered))
	for _, event := range filtered {
		node := &model.CausalityNode{
			EventID:     event.EventID,
			EventType:   event.EventType,
			ServiceName: event.Metadata.ServiceName,
			Timestamp:   event.Metadata.Timestamp,
			Sequence:    event.Sequence,
			VectorClock: event.Metadata.VectorClock,
		}
		if opts.IncludePayload {
			node.Payload = event.Payload
		}
		nodes = append(nodes, node)
	}

	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].Sequence < nodes[j].Sequence
	})

	edges := a.buildEdges(filtered, eventMap)

	return &model.CausalityGraph{
		Nodes: nodes,
		Edges: edges,
	}
}

func (a *Analyzer) filterEvents(events []*model.AuditEvent, opts *BuildOptions) []*model.AuditEvent {
	if opts == nil || (opts.StartTime.IsZero() && opts.EndTime.IsZero()) {
		return events
	}

	var filtered []*model.AuditEvent
	startMs := opts.StartTime.UnixMilli()
	endMs := opts.EndTime.UnixMilli()

	for _, event := range events {
		ts := event.Metadata.Timestamp
		if !opts.StartTime.IsZero() && ts < startMs {
			continue
		}
		if !opts.EndTime.IsZero() && ts > endMs {
			continue
		}
		filtered = append(filtered, event)
	}
	return filtered
}

func (a *Analyzer) buildEdges(events []*model.AuditEvent, eventMap map[string]*model.AuditEvent) []*model.CausalityEdge {
	edges := make([]*model.CausalityEdge, 0)
	edgeSet := make(map[string]bool)

	for _, event := range events {
		for _, parentID := range event.Metadata.ParentEventIDs {
			if parentEvent, exists := eventMap[parentID]; exists {
				edgeKey := parentID + "->" + event.EventID
				if !edgeSet[edgeKey] {
					edges = append(edges, &model.CausalityEdge{
						FromEventID: parentID,
						ToEventID:   event.EventID,
						Type:        "explicit",
					})
					edgeSet[edgeKey] = true
				}
			}
		}

		if event.Metadata.VectorClock != nil {
			for _, otherEvent := range events {
				if otherEvent.EventID == event.EventID {
					continue
				}
				if otherEvent.Metadata.VectorClock == nil {
					continue
				}

				if otherEvent.Metadata.VectorClock.HappensBefore(event.Metadata.VectorClock) {
					edgeKey := otherEvent.EventID + "->" + event.EventID
					if !edgeSet[edgeKey] {
						hasExplicitParent := false
						for _, parentID := range event.Metadata.ParentEventIDs {
							if parentID == otherEvent.EventID {
								hasExplicitParent = true
								break
							}
						}
						if !hasExplicitParent {
							edges = append(edges, &model.CausalityEdge{
								FromEventID: otherEvent.EventID,
								ToEventID:   event.EventID,
								Type:        "implicit",
							})
							edgeSet[edgeKey] = true
						}
					}
				}
			}
		}
	}

	return edges
}

func (a *Analyzer) AnalyzeAnomalies(graph *model.CausalityGraph, events []*model.AuditEvent) []*model.Anomaly {
	anomalies := make([]*model.Anomaly, 0)

	eventMap := make(map[string]*model.AuditEvent)
	for _, event := range events {
		eventMap[event.EventID] = event
	}

	anomalies = append(anomalies, a.detectTimestampAnomalies(graph, eventMap)...)
	anomalies = append(anomalies, a.detectBusinessLogicAnomalies(graph, eventMap)...)
	anomalies = append(anomalies, a.detectVectorClockAnomalies(graph, eventMap)...)

	return anomalies
}

func (a *Analyzer) detectTimestampAnomalies(graph *model.CausalityGraph, eventMap map[string]*model.AuditEvent) []*model.Anomaly {
	anomalies := make([]*model.Anomaly, 0)

	for _, edge := range graph.Edges {
		fromEvent, fromExists := eventMap[edge.FromEventID]
		toEvent, toExists := eventMap[edge.ToEventID]

		if !fromExists || !toExists {
			continue
		}

		if toEvent.Metadata.Timestamp < fromEvent.Metadata.Timestamp {
			anomalies = append(anomalies, &model.Anomaly{
				Type:        "TIMESTAMP_REVERSAL",
				Severity:    "medium",
				Description: "Timestamp anomaly: causal predecessor has later timestamp than successor",
				Event1:      edge.FromEventID,
				Event2:      edge.ToEventID,
			})
		}
	}

	return anomalies
}

func (a *Analyzer) detectBusinessLogicAnomalies(graph *model.CausalityGraph, eventMap map[string]*model.AuditEvent) []*model.Anomaly {
	anomalies := make([]*model.Anomaly, 0)

	orderEvents := make([]*model.AuditEvent, 0)
	paymentEvents := make([]*model.AuditEvent, 0)

	for _, event := range eventMap {
		switch event.EventType {
		case "OrderCreated":
			orderEvents = append(orderEvents, event)
		case "PaymentCompleted":
			paymentEvents = append(paymentEvents, event)
		}
	}

	for _, payment := range paymentEvents {
		paymentOrderID := ""
		if orderID, ok := payment.Payload["order_id"].(string); ok {
			paymentOrderID = orderID
		}

		foundMatchingOrder := false
		for _, order := range orderEvents {
			orderOrderID := ""
			if orderID, ok := order.Payload["order_id"].(string); ok {
				orderOrderID = orderID
			}

			if orderOrderID == paymentOrderID {
				foundMatchingOrder = true

				hasCausalRelation := false
				if order.Metadata.VectorClock != nil && payment.Metadata.VectorClock != nil {
					if order.Metadata.VectorClock.HappensBefore(payment.Metadata.VectorClock) {
						hasCausalRelation = true
					}
				}

				if !hasCausalRelation && payment.Metadata.Timestamp < order.Metadata.Timestamp {
					anomalies = append(anomalies, &model.Anomaly{
						Type:        "PAYMENT_BEFORE_ORDER",
						Severity:    "high",
						Description: "Critical anomaly: Payment event occurs before corresponding OrderCreated event",
						Event1:      payment.EventID,
						Event2:      order.EventID,
					})
				}
				break
			}
		}

		if !foundMatchingOrder {
			anomalies = append(anomalies, &model.Anomaly{
				Type:        "ORPHAN_PAYMENT",
				Severity:    "medium",
				Description: "Payment event without corresponding OrderCreated event found",
				Event1:      payment.EventID,
				Event2:      "",
			})
		}
	}

	return anomalies
}

func (a *Analyzer) detectVectorClockAnomalies(graph *model.CausalityGraph, eventMap map[string]*model.AuditEvent) []*model.Anomaly {
	anomalies := make([]*model.Anomaly, 0)

	eventsList := make([]*model.AuditEvent, 0, len(eventMap))
	for _, event := range eventMap {
		eventsList = append(eventsList, event)
	}

	sort.Slice(eventsList, func(i, j int) bool {
		return eventsList[i].Sequence < eventsList[j].Sequence
	})

	for i := 0; i < len(eventsList); i++ {
		for j := i + 1; j < len(eventsList); j++ {
			e1 := eventsList[i]
			e2 := eventsList[j]

			if e1.Metadata.VectorClock == nil || e2.Metadata.VectorClock == nil {
				continue
			}

			if e1.Metadata.VectorClock.HappensAfter(e2.Metadata.VectorClock) {
				anomalies = append(anomalies, &model.Anomaly{
					Type:        "VECTOR_CLOCK_CONFLICT",
					Severity:    "low",
					Description: "Vector clock indicates later sequence event happened before earlier sequence event (potential concurrency)",
					Event1:      e2.EventID,
					Event2:      e1.EventID,
				})
			}
		}
	}

	return anomalies
}

func (a *Analyzer) TraceCausalityChain(graph *model.CausalityGraph, startEventID string, direction string) []string {
	visited := make(map[string]bool)
	chain := make([]string, 0)

	var dfs func(eventID string)
	dfs = func(eventID string) {
		if visited[eventID] {
			return
		}
		visited[eventID] = true
		chain = append(chain, eventID)

		if direction == "forward" {
			for _, edge := range graph.Edges {
				if edge.FromEventID == eventID {
					dfs(edge.ToEventID)
				}
			}
		} else {
			for _, edge := range graph.Edges {
				if edge.ToEventID == eventID {
					dfs(edge.FromEventID)
				}
			}
		}
	}

	dfs(startEventID)
	return chain
}

func (a *Analyzer) Analyze(events []*model.AuditEvent, opts *BuildOptions) *model.CausalityAnalysisResult {
	graph := a.BuildCausalityGraph(events, opts)
	anomalies := a.AnalyzeAnomalies(graph, events)

	return &model.CausalityAnalysisResult{
		Graph:      graph,
		Anomalies:  anomalies,
		EventCount: len(graph.Nodes),
		EdgeCount:  len(graph.Edges),
	}
}
