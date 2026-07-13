import { Request, Response } from "express";
import AgentExecution from "../models/agentExecution.model";
import { executeAgent } from "../services/langgraph.service";

export const runAgent = async (req: Request, res: Response) => {
    try {
        const { tripId, query } = req.body;

        const execution = await AgentExecution.create({
            tripId,
            query,
            status: "RUNNING",
            startedAt: new Date()
        });

        const result = await executeAgent({
            tripId,
            query,
            executionId: execution._id
        });

        execution.status = "COMPLETED";
        execution.result = result;
        execution.completedAt = new Date();

        await execution.save();

        res.status(200).json({
            success: true,
            executionId: execution._id,
            result
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getExecutionStatus = async (
    req: Request,
    res: Response
) => {
    try {
        const execution = await AgentExecution.findById(
            req.params.executionId
        );

        if (!execution) {
            return res.status(404).json({
                success: false,
                message: "Execution not found"
            });
        }

        res.status(200).json({
            success: true,
            execution
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getExecutionHistory = async (
    req: Request,
    res: Response
) => {
    try {
        const history = await AgentExecution.find({
            tripId: req.params.tripId
        })
        .sort({ createdAt: -1 })
        .limit(20);

        res.status(200).json({
            success: true,
            count: history.length,
            history
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const retryExecution = async (
    req: Request,
    res: Response
) => {
    try {
        const execution = await AgentExecution.findById(
            req.params.executionId
        );

        if (!execution) {
            return res.status(404).json({
                success: false,
                message: "Execution not found"
            });
        }

        const result = await executeAgent({
            tripId: execution.tripId,
            query: execution.query,
            executionId: execution._id
        });

        execution.status = "COMPLETED";
        execution.result = result;
        execution.retryCount =
            (execution.retryCount || 0) + 1;

        await execution.save();

        res.status(200).json({
            success: true,
            retries: execution.retryCount,
            result
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const cancelExecution = async (
    req: Request,
    res: Response
) => {
    try {
        const execution = await AgentExecution.findByIdAndUpdate(
            req.params.executionId,
            {
                status: "CANCELLED",
                cancelledAt: new Date()
            },
            { new: true }
        );

        res.status(200).json({
            success: true,
            execution
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};