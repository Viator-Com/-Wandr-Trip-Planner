import { Request, Response } from "express";
import Memory from "../models/memory.model";
import { embedText } from "../services/embedding.service";
import {
    insertVector,
    searchVectors,
    deleteVector
} from "../services/milvus.service";

export const storeMemory = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { tripId, content, category } = req.body;

        const embedding = await embedText(content);

        const memory = await Memory.create({
            userId: req.user.id,
            tripId,
            content,
            category,
            embeddingCreated: true,
            createdAt: new Date()
        });

        await insertVector({
            id: memory._id.toString(),
            vector: embedding,
            metadata: {
                userId: req.user.id,
                tripId,
                category
            }
        });

        res.status(201).json({
            success: true,
            message: "Memory stored successfully",
            memory
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const retrieveRelevantMemories = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { query, limit = 5 } = req.body;

        const queryEmbedding = await embedText(query);

        const memories = await searchVectors(
            queryEmbedding,
            Number(limit),
            req.user.id
        );

        res.status(200).json({
            success: true,
            count: memories.length,
            memories
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getTripMemories = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const memories = await Memory.find({
            tripId: req.params.tripId,
            userId: req.user.id
        }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: memories.length,
            memories
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const deleteMemory = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const memory = await Memory.findById(req.params.memoryId);

        if (!memory) {
            res.status(404).json({
                success: false,
                message: "Memory not found"
            });
            return;
        }

        await deleteVector(memory._id.toString());

        await Memory.findByIdAndDelete(memory._id);

        res.status(200).json({
            success: true,
            message: "Memory deleted successfully"
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getMemoryStats = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const totalMemories = await Memory.countDocuments({
            userId: req.user.id
        });

        const categories = await Memory.aggregate([
            {
                $match: {
                    userId: req.user.id
                }
            },
            {
                $group: {
                    _id: "$category",
                    count: {
                        $sum: 1
                    }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            totalMemories,
            categories
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};