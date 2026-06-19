# HyperVisor: Pulsater

HyperVisor: Pulsater is a full-stack data streaming and synchronization platform designed to process, monitor, and visualize real-time ledger transactions. The platform leverages Change Data Capture (CDC) pipelines, concurrent Go microservices, and a modern Next.js dashboard to provide low-latency transaction monitoring and telemetry insights.

## Features

* Real-time Change Data Capture (CDC) pipeline for transaction ingestion and synchronization
* Concurrent and thread-safe Go microservice architecture
* PostgreSQL-backed persistence layer with optimized connection pooling
* JWT-based authentication and authorization
* OAuth 2.0 login support (Google, Facebook, GitHub)
* Interactive Next.js dashboard for monitoring transaction streams
* Telemetry and notification system for system events and diagnostics
* Responsive UI with client-side state hydration and profile caching
* Dockerized services for simplified deployment

## Tech Stack

### Backend

* Go (Golang)
* PostgreSQL
* REST APIs
* JWT Authentication
* OAuth 2.0

### Frontend

* Next.js
* TypeScript
* React
* Local Storage Caching

### DevOps

* Docker
* Environment Configuration Management

## Architecture

The platform follows a microservice-oriented architecture where streaming transaction events are ingested through CDC pipelines and processed by Go services. Processed data is persisted in PostgreSQL and exposed through REST APIs. The Next.js frontend consumes these APIs to provide real-time monitoring, diagnostics, and telemetry visualization.

## Future Enhancements

* WebSocket-based live event streaming
* Distributed event processing with Kafka
* Advanced analytics and anomaly detection
* Multi-tenant workspace support
* Kubernetes deployment support

## Getting Started

```bash
# Clone repository
git clone <repository-url>

# Configure environment variables
cp .env.example .env

# Start services
docker-compose up --build
```

## License

This project is developed for educational and portfolio purposes.
